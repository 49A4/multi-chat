package com.multichat.service;

import com.multichat.model.AiApiConfig;
import com.multichat.model.ChatMessage;
import com.multichat.model.SseEvent;
import com.multichat.store.ApiConfigStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
public class ChatService {

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
        Boolean appendUserMessage
    ) {
        String eventSessionId = normalizeSessionId(sessionId);
        List<ChatMessage> context = buildRequestContext(prompt);

        List<AiApiConfig> enabledConfigs = apiConfigStore.findAllEnabled();
        if (enabledConfigs.isEmpty()) {
            return Flux.just(SseEvent.error(eventSessionId, "system", "No enabled API config found", ""));
        }

        Set<String> requestedModelTags = targetModels == null
            ? Set.of()
            : targetModels.stream()
                .filter(model -> model != null && !model.isBlank())
                .map(String::trim)
                .collect(Collectors.toSet());

        List<AiApiConfig> targetConfigs = requestedModelTags.isEmpty()
            ? enabledConfigs
            : enabledConfigs.stream()
                .filter(config -> {
                    String modelTag = buildModelTag(config);
                    String displayLabel = buildDisplayLabel(config);
                    return requestedModelTags.contains(modelTag) || requestedModelTags.contains(displayLabel);
                })
                .toList();

        if (targetConfigs.isEmpty()) {
            return Flux.just(SseEvent.error(eventSessionId, "system", "No matched enabled model found for retry", ""));
        }

        List<Flux<SseEvent>> streams = targetConfigs.stream()
            .map(config -> buildModelEventStream(eventSessionId, config, context))
            .toList();

        return Flux.merge(streams);
    }

    private Flux<SseEvent> buildModelEventStream(String sessionId, AiApiConfig config, List<ChatMessage> context) {
        String modelTag = buildModelTag(config);
        StringBuilder fullText = new StringBuilder();

        return openAiCompatClient.streamCompletion(config, context)
            .map(delta -> {
                fullText.append(delta);
                return SseEvent.delta(sessionId, modelTag, delta);
            })
            .concatWith(Mono.fromSupplier(() -> {
                if (fullText.isEmpty()) {
                    return SseEvent.error(
                        sessionId,
                        modelTag,
                        "模型已结束但未返回文本，请检查 model 名称、权限或供应商响应格式",
                        ""
                    );
                }
                return SseEvent.done(sessionId, modelTag, fullText.toString());
            }))
            .onErrorResume(ex -> Mono.just(SseEvent.error(sessionId, modelTag, ex.getMessage(), fullText.toString())));
    }

    private String buildModelTag(AiApiConfig config) {
        return buildDisplayLabel(config) + "||" + config.getId();
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
}
