package com.multichat.service;

import com.multichat.dto.ImageInput;
import com.multichat.model.AiApiConfig;
import com.multichat.model.ChatMessage;
import com.multichat.model.SseEvent;
import com.multichat.model.TokenUsage;
import com.multichat.store.ApiConfigStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final String MODE_IMAGE = "image";

    private static final String NO_THINK_SYSTEM_PROMPT = """
        You are a concise assistant.
        Return only the final answer.
        Do not reveal chain-of-thought, internal reasoning, draft notes, or self-reflection.
        Never output tags like <think>...</think> or <thinking>...</thinking>.
        If reasoning is needed, do it internally and only provide the final result.
        """;

    private final ApiConfigStore apiConfigStore;
    private final OpenAiCompatClient openAiCompatClient;

    public Flux<SseEvent> streamChat(
        String clientId,
        String sessionId,
        String prompt,
        List<String> targetModels,
        Boolean appendUserMessage,
        String mode,
        Integer imageCount,
        String imageAspectRatio,
        String imageQuality,
        ImageInput imageInput,
        List<ImageInput> imageInputs
    ) {
        String eventSessionId = normalizeSessionId(sessionId);
        boolean imageMode = isImageMode(mode);

        List<AiApiConfig> enabledConfigs = apiConfigStore.findAllEnabled(clientId);
        if (enabledConfigs.isEmpty()) {
            return Flux.just(SseEvent.error(eventSessionId, "system", "No enabled API config found", ""));
        }
        List<AiApiConfig> modeFilteredConfigs = enabledConfigs.stream()
            .filter(cfg -> supportsMode(cfg, imageMode))
            .toList();
        if (modeFilteredConfigs.isEmpty()) {
            String missingType = imageMode ? "image" : "text";
            return Flux.just(SseEvent.error(eventSessionId, "system", "No enabled " + missingType + " API config found", ""));
        }

        Set<String> requestedModelTags = targetModels == null
            ? Set.of()
            : targetModels.stream()
                .filter(model -> model != null && !model.isBlank())
                .map(String::trim)
                .collect(Collectors.toSet());

        List<ModelExecution> expandedExecutions = expandModelExecutions(modeFilteredConfigs);
        List<ModelExecution> targetConfigs = requestedModelTags.isEmpty()
            ? expandedExecutions
            : expandedExecutions.stream()
                .filter(execution -> requestedModelTags.contains(execution.modelTag()))
                .toList();

        if (targetConfigs.isEmpty()) {
            return Flux.just(SseEvent.error(eventSessionId, "system", "No matched enabled model found for retry", ""));
        }

        if (imageMode) {
            int normalizedImageCount = normalizeImageCount(imageCount);
            String normalizedImageAspectRatio = normalizeImageAspectRatio(imageAspectRatio);
            String normalizedImageQuality = normalizeImageQuality(imageQuality);
            List<ImageInput> normalizedImageInputs = normalizeImageInputs(imageInput, imageInputs);
            List<Flux<SseEvent>> imageStreams = targetConfigs.stream()
                .map(execution -> buildImageEventStream(
                    eventSessionId,
                    execution,
                    prompt,
                    normalizedImageCount,
                    normalizedImageAspectRatio,
                    normalizedImageQuality,
                    normalizedImageInputs
                ))
                .toList();
            return Flux.merge(imageStreams);
        }

        List<ChatMessage> context = buildRequestContext(prompt);
        List<Flux<SseEvent>> textStreams = targetConfigs.stream()
            .map(execution -> buildModelEventStream(eventSessionId, execution, context))
            .toList();

        return Flux.merge(textStreams);
    }

    private Flux<SseEvent> buildModelEventStream(String sessionId, ModelExecution execution, List<ChatMessage> context) {
        AiApiConfig config = execution.config();
        String modelTag = execution.modelTag();
        StringBuilder fullText = new StringBuilder();
        AtomicReference<TokenUsage> usageRef = new AtomicReference<>();

        return openAiCompatClient.streamCompletion(config, context)
            .flatMap(chunk -> {
                if (chunk.usage() != null) {
                    usageRef.set(chunk.usage());
                }

                String delta = chunk.delta();
                if (delta == null || delta.isBlank()) {
                    return Flux.empty();
                }

                fullText.append(delta);
                return Flux.just(SseEvent.delta(sessionId, modelTag, delta));
            })
            .concatWith(Mono.fromSupplier(() -> {
                if (fullText.isEmpty()) {
                    return SseEvent.error(
                        sessionId,
                        modelTag,
                        "Model finished without any text output. Please verify model name, permission, or provider response format.",
                        ""
                    );
                }
                return SseEvent.done(sessionId, modelTag, fullText.toString(), usageRef.get());
            }))
            .onErrorResume(ex -> Mono.just(SseEvent.error(sessionId, modelTag, ex.getMessage(), fullText.toString())));
    }

    private Flux<SseEvent> buildImageEventStream(
        String sessionId,
        ModelExecution execution,
        String prompt,
        int imageCount,
        String imageAspectRatio,
        String imageQuality,
        List<ImageInput> imageInputs
    ) {
        AiApiConfig config = execution.config();
        String modelTag = execution.modelTag();

        return openAiCompatClient.generateImages(config, prompt, imageCount, imageAspectRatio, imageQuality, imageInputs)
            .flatMapMany(images -> {
                if (images == null || images.isEmpty()) {
                    return Flux.just(SseEvent.error(sessionId, modelTag, "Image generation returned no images", ""));
                }
                String markdown = buildImageMarkdown(images);
                return Flux.just(SseEvent.done(sessionId, modelTag, markdown));
            })
            .onErrorResume(ex -> Mono.just(SseEvent.error(sessionId, modelTag, ex.getMessage(), "")));
    }

    private String buildImageMarkdown(List<String> images) {
        StringBuilder markdown = new StringBuilder();
        int index = 1;
        for (String image : images) {
            if (image == null || image.isBlank()) {
                continue;
            }
            markdown.append("![Image ")
                .append(index++)
                .append("](")
                .append(image)
                .append(")\n\n");
        }

        if (markdown.isEmpty()) {
            return "_Image generation finished but no valid image URL was returned._";
        }
        return markdown.toString().trim();
    }

    private boolean isImageMode(String mode) {
        return mode != null && MODE_IMAGE.equalsIgnoreCase(mode.trim());
    }

    private List<ModelExecution> expandModelExecutions(List<AiApiConfig> enabledConfigs) {
        List<ModelExecution> executions = new ArrayList<>();
        for (AiApiConfig config : enabledConfigs) {
            int repeatCount = normalizeGenerateCount(config.getGenerateCount());
            for (int replicaIndex = 1; replicaIndex <= repeatCount; replicaIndex++) {
                executions.add(new ModelExecution(config, buildModelTag(config, replicaIndex)));
            }
        }
        return executions;
    }

    private int normalizeGenerateCount(Integer rawCount) {
        if (rawCount == null) {
            return 1;
        }
        return Math.max(1, Math.min(rawCount, 20));
    }

    private int normalizeImageCount(Integer rawCount) {
        if (rawCount == null) {
            return 1;
        }
        return Math.max(1, Math.min(rawCount, 8));
    }

    private String normalizeImageAspectRatio(String rawRatio) {
        String ratio = rawRatio == null ? "" : rawRatio.trim();
        if (ratio.isBlank()) {
            return "3:4";
        }
        return switch (ratio) {
            case "1:1", "3:4", "4:3", "9:16", "16:9" -> ratio;
            default -> "3:4";
        };
    }

    private String normalizeImageQuality(String rawQuality) {
        String quality = rawQuality == null ? "" : rawQuality.trim().toLowerCase();
        if (quality.isBlank()) {
            return "high";
        }
        return switch (quality) {
            case "low", "medium", "high", "auto" -> quality;
            default -> "high";
        };
    }

    private List<ImageInput> normalizeImageInputs(ImageInput imageInput, List<ImageInput> imageInputs) {
        List<ImageInput> merged = new ArrayList<>();
        if (imageInputs != null) {
            for (ImageInput item : imageInputs) {
                if (item == null) {
                    continue;
                }
                String data = item.getData() == null ? "" : item.getData().trim();
                if (data.isBlank()) {
                    continue;
                }
                merged.add(normalizeImageInputMetadata(item, merged.size()));
            }
        }
        if (merged.isEmpty() && imageInput != null) {
            String data = imageInput.getData() == null ? "" : imageInput.getData().trim();
            if (!data.isBlank()) {
                merged.add(normalizeImageInputMetadata(imageInput, merged.size()));
            }
        }
        if (merged.isEmpty()) {
            return List.of();
        }
        return List.copyOf(merged);
    }

    private ImageInput normalizeImageInputMetadata(ImageInput source, int index) {
        ImageInput normalized = new ImageInput();
        normalized.setMimeType(source.getMimeType() == null ? "" : source.getMimeType().trim());
        normalized.setData(source.getData() == null ? "" : source.getData().trim());
        normalized.setOrder(source.getOrder() != null && source.getOrder() > 0 ? source.getOrder() : index + 1);
        String role = source.getRole() == null ? "" : source.getRole().trim();
        if (role.isBlank()) {
            role = switch (index) {
                case 0 -> "target";
                case 1 -> "face_reference";
                default -> "reference";
            };
        }
        normalized.setRole(role);
        normalized.setName(source.getName() == null ? "" : source.getName().trim());
        return normalized;
    }

    private boolean supportsMode(AiApiConfig config, boolean imageMode) {
        if (config == null) {
            return false;
        }

        String apiType = config.getApiType();
        if (apiType != null && !apiType.isBlank()) {
            String normalized = apiType.trim().toLowerCase();
            if (AiApiConfig.TYPE_IMAGE.equals(normalized)) {
                return imageMode;
            }
            if (AiApiConfig.TYPE_TEXT.equals(normalized)) {
                return !imageMode;
            }
        }

        // Backward compatibility for historical configs that do not carry apiType yet.
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        boolean looksImageModel = modelName.contains("image") || modelName.startsWith("wan2.") || modelName.startsWith("wan-");
        return imageMode ? looksImageModel : !looksImageModel;
    }

    private String buildModelTag(AiApiConfig config) {
        return buildModelTag(config, 1);
    }

    private String buildModelTag(AiApiConfig config, int replicaIndex) {
        String displayLabel = buildDisplayLabel(config);
        String id = config.getId() == null ? "" : config.getId().trim();
        int safeReplicaIndex = Math.max(1, replicaIndex);

        if (safeReplicaIndex > 1) {
            String replicaLabel = displayLabel + " #" + safeReplicaIndex;
            if (id.isBlank()) {
                return replicaLabel;
            }
            return replicaLabel + "||" + id + "::rep" + safeReplicaIndex;
        }

        if (id.isBlank()) {
            return displayLabel;
        }
        return displayLabel + "||" + id;
    }

    private String buildDisplayLabel(AiApiConfig config) {
        if (config.getName() != null && !config.getName().isBlank()) {
            return config.getName();
        }
        return config.getModelName();
    }

    private List<ChatMessage> buildRequestContext(String prompt) {
        List<ChatMessage> context = new ArrayList<>(2);
        context.add(ChatMessage.builder()
            .role("system")
            .content(NO_THINK_SYSTEM_PROMPT)
            .build());
        context.add(ChatMessage.builder()
            .role("user")
            .content(prompt)
            .build());
        return context;
    }

    private String normalizeSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return "stateless-" + UUID.randomUUID();
        }
        return sessionId.trim();
    }

    private record ModelExecution(AiApiConfig config, String modelTag) {
    }
}
