package com.multichat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.dto.ImageInput;
import com.multichat.model.AiApiConfig;
import com.multichat.model.ChatMessage;
import com.multichat.model.TokenUsage;
import com.multichat.provider.ProviderErrorClassifier;
import com.multichat.provider.ProviderImageSupport;
import com.multichat.provider.ProviderProtocolSupport;
import com.multichat.provider.ProviderResponseParsers;
import com.multichat.provider.ProviderUrlBuilder;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

@Slf4j
@Service
@RequiredArgsConstructor
public class OpenAiCompatClient {

    private static final Duration REQUEST_IDLE_TIMEOUT = Duration.ofSeconds(180);
    private static final Duration IMAGE_EDIT_ATTEMPT_TIMEOUT = Duration.ofSeconds(70);
    private static final int TRANSIENT_ERROR_RETRY_COUNT = 2;
    private static final Duration TRANSIENT_ERROR_RETRY_BACKOFF = Duration.ofMillis(800);
    private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE_STRING_TYPE =
        new ParameterizedTypeReference<>() { };

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public record StreamChunk(String delta, TokenUsage usage) {
    }

    public Flux<StreamChunk> streamCompletion(AiApiConfig config, List<ChatMessage> context) {
        return streamCompletionInternal(config, context, true)
            .onErrorResume(error -> {
                if (ProviderErrorClassifier.isUsageUnsupportedError(error)) {
                    log.info("Provider does not support stream_options.include_usage, fallback without usage: {}", config.getName());
                    return streamCompletionInternal(config, context, false);
                }
                return Flux.error(error);
            })
            .timeout(REQUEST_IDLE_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException(
                    "Model stream timed out after 180s without new tokens. " +
                    "Try reducing maxTokens or disabling long reasoning output."
                )
            )
            .doOnError(ex -> log.warn("Model stream failed for {}: {}", config.getName(), ex.getMessage()));
    }

    private Flux<StreamChunk> streamCompletionInternal(AiApiConfig config, List<ChatMessage> context, boolean includeUsage) {
        String endpoint = ProviderUrlBuilder.buildCompletionsEndpoint(config.getBaseUrl());

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", config.getModelName());
        requestBody.put("stream", true);
        requestBody.put("max_tokens", config.getMaxTokens());
        requestBody.put("temperature", config.getTemperature());
        requestBody.put("messages", context.stream()
            .map(msg -> Map.of("role", msg.getRole(), "content", msg.getContent()))
            .toList());
        if (includeUsage) {
            requestBody.put("stream_options", Map.of("include_usage", true));
        }

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.TEXT_EVENT_STREAM, MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .bodyValue(requestBody)
            .exchangeToFlux(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    MediaType contentType = response.headers().contentType().orElse(MediaType.APPLICATION_OCTET_STREAM);

                    if (MediaType.TEXT_EVENT_STREAM.isCompatibleWith(contentType)) {
                        return response.bodyToFlux(SSE_STRING_TYPE)
                            .flatMap(event -> {
                                String data = event.data();
                                if (data == null || data.isBlank()) {
                                    return Flux.empty();
                                }
                                return extractChunkOrError(data.trim());
                            });
                    }

                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMapMany(this::extractChunkOrError);
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMapMany(body -> Flux.error(buildHttpException(response.statusCode().value(), body)));
            });
    }

    public Mono<List<String>> generateImages(
        AiApiConfig config,
        String prompt,
        int imageCount,
        String imageAspectRatio,
        String imageQuality,
        List<ImageInput> imageInputs
    ) {
        List<ImageInput> normalizedImageInputs = ProviderImageSupport.normalizeImageInputs(imageInputs);
        String normalizedImageAspectRatio = ProviderImageSupport.normalizeImageAspectRatio(imageAspectRatio);
        String normalizedImageQuality = ProviderImageSupport.normalizeImageQuality(imageQuality);
        String openAiImageSize = ProviderImageSupport.resolveOpenAiImageSize(normalizedImageAspectRatio);
        boolean applyOpenAiImageOptions = ProviderImageSupport.usesOpenAiImageModel(config);

        if (ProviderProtocolSupport.usesOpenAiGptImage2EditProtocol(config, normalizedImageInputs)) {
            return generateOpenAiGptImage2Edits(
                config,
                prompt,
                imageCount,
                openAiImageSize,
                normalizedImageQuality,
                normalizedImageInputs
            );
        }
        if (ProviderProtocolSupport.usesApiYiGeminiImageEditProtocol(config, normalizedImageInputs)) {
            return generateApiYiGeminiImages(config, prompt, imageCount, normalizedImageInputs);
        }
        if (ProviderProtocolSupport.usesDashScopeQwenImageProtocol(config)) {
            return generateDashScopeQwenImages(config, prompt, imageCount, normalizedImageInputs);
        }
        if (ProviderProtocolSupport.usesDashScopeWanProtocol(config)) {
            return generateDashScopeWanImages(config, prompt, imageCount);
        }

        String endpoint = ProviderUrlBuilder.buildImagesEndpoint(config.getBaseUrl());
        int safeImageCount = Math.max(1, Math.min(imageCount, 8));

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", config.getModelName());
        requestBody.put("prompt", prompt);
        requestBody.put("n", safeImageCount);
        if (applyOpenAiImageOptions) {
            requestBody.put("size", openAiImageSize);
            requestBody.put("quality", normalizedImageQuality);
        }

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .bodyValue(requestBody)
            .exchangeToMono(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMap(body -> {
                            try {
                                return Mono.just(ProviderResponseParsers.extractImageOutputsOrError(objectMapper, body));
                            } catch (RuntimeException ex) {
                                return Mono.error(ex);
                            }
                        });
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> Mono.error(buildHttpException(response.statusCode().value(), body)));
            })
            .retryWhen(
                Retry.backoff(TRANSIENT_ERROR_RETRY_COUNT, TRANSIENT_ERROR_RETRY_BACKOFF)
                    .filter(ProviderErrorClassifier::isRetryableImageError)
            )
            .timeout(REQUEST_IDLE_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException("Image generation timed out after 180s without response.")
            )
            .doOnError(ex -> log.warn("Image generation failed for {}: {}", config.getName(), ex.getMessage()));
    }

    private Mono<List<String>> generateOpenAiGptImage2Edits(
        AiApiConfig config,
        String prompt,
        int imageCount,
        String imageSize,
        String imageQuality,
        List<ImageInput> imageInputs
    ) {
        String endpoint = ProviderUrlBuilder.buildImageEditsEndpoint(config.getBaseUrl());
        int safeImageCount = Math.max(1, Math.min(imageCount, 8));
        List<ImageInput> limitedImageInputs = imageInputs.stream().limit(5).toList();
        if (limitedImageInputs.isEmpty()) {
            return Mono.error(new RuntimeException("Image input is empty"));
        }

        String preferredFieldName = ProviderImageSupport.resolveOpenAiImageFieldName(config);
        Mono<List<String>> preferredRequest = requestOpenAiGptImage2Edits(
            config,
            endpoint,
            ProviderImageSupport.buildReferenceAwarePrompt(prompt, limitedImageInputs),
            safeImageCount,
            imageSize,
            imageQuality,
            limitedImageInputs,
            preferredFieldName
        );
        if (!isApiYiBaseUrl(config)) {
            return preferredRequest;
        }

        String fallbackFieldName = "image[]".equals(preferredFieldName) ? "image" : "image[]";
        return preferredRequest.onErrorResume(firstError -> {
            log.warn(
                "GPT-Image-2 edit failed on field {} for {}: {}. Retrying with field {}",
                preferredFieldName,
                config.getName(),
                firstError.getMessage(),
                fallbackFieldName
            );
            return requestOpenAiGptImage2Edits(
                config,
                endpoint,
                ProviderImageSupport.buildReferenceAwarePrompt(prompt, limitedImageInputs),
                safeImageCount,
                imageSize,
                imageQuality,
                limitedImageInputs,
                fallbackFieldName
            );
        });
    }

    private Mono<List<String>> requestOpenAiGptImage2Edits(
        AiApiConfig config,
        String endpoint,
        String prompt,
        int imageCount,
        String imageSize,
        String imageQuality,
        List<ImageInput> imageInputs,
        String imageFieldName
    ) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("model", config.getModelName());
        builder.part("prompt", prompt == null ? "" : prompt);
        builder.part("n", String.valueOf(imageCount));
        builder.part("size", ProviderImageSupport.resolveOpenAiImageSize(imageSize));
        builder.part("quality", ProviderImageSupport.normalizeImageQuality(imageQuality));
        int imagePartCount = 0;

        for (int index = 0; index < imageInputs.size(); index++) {
            ImageInput imageInput = imageInputs.get(index);
            String mimeType = ProviderImageSupport.normalizeImageMimeType(imageInput.getMimeType());
            String base64 = ProviderImageSupport.extractBase64Payload(imageInput.getData());
            if (base64.isBlank()) {
                continue;
            }
            byte[] bytes;
            try {
                bytes = Base64.getDecoder().decode(base64);
            } catch (IllegalArgumentException ex) {
                return Mono.error(new RuntimeException("Reference image base64 is invalid"));
            }

            String extension = ProviderImageSupport.guessImageExtension(mimeType);
            String roleSlug = ProviderImageSupport.normalizeImageRole(imageInput.getRole()).replace('_', '-');
            String filename = "reference-" + (index + 1) + "-" + roleSlug + extension;
            ByteArrayResource resource = new ByteArrayResource(bytes) {
                @Override
                public String getFilename() {
                    return filename;
                }
            };
            builder.part(imageFieldName, resource).contentType(MediaType.parseMediaType(mimeType));
            imagePartCount += 1;
        }

        if (imagePartCount == 0) {
            return Mono.error(new RuntimeException("Reference image payload is empty"));
        }

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .accept(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .body(BodyInserters.fromMultipartData(builder.build()))
            .exchangeToMono(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMap(body -> {
                            try {
                                return Mono.just(ProviderResponseParsers.extractImageOutputsOrError(objectMapper, body));
                            } catch (RuntimeException ex) {
                                return Mono.error(ex);
                            }
                        });
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> Mono.error(buildHttpException(response.statusCode().value(), body)));
            })
            .retryWhen(
                Retry.backoff(TRANSIENT_ERROR_RETRY_COUNT, TRANSIENT_ERROR_RETRY_BACKOFF)
                    .filter(ProviderErrorClassifier::isRetryableImageError)
            )
            .timeout(IMAGE_EDIT_ATTEMPT_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException("Image edit timed out after 70s without response.")
            )
            .doOnError(ex -> log.warn(
                "GPT-Image-2 edit failed for {} (field={}): {}",
                config.getName(),
                imageFieldName,
                ex.getMessage()
            ));
    }

    private Mono<List<String>> generateApiYiGeminiImages(
        AiApiConfig config,
        String prompt,
        int imageCount,
        List<ImageInput> imageInputs
    ) {
        String endpoint = ProviderUrlBuilder.buildApiYiGeminiGenerateContentEndpoint(config.getBaseUrl(), config.getModelName());
        int safeImageCount = Math.max(1, Math.min(imageCount, 8));
        List<ImageInput> normalizedImageInputs = ProviderImageSupport.normalizeImageInputs(imageInputs);
        if (normalizedImageInputs.isEmpty()) {
            return Mono.error(new RuntimeException("Image input is empty"));
        }
        String safePrompt = ProviderImageSupport.buildReferenceAwarePrompt(prompt, normalizedImageInputs);
        String effectivePrompt = safePrompt.isBlank() ? "Please edit this image." : safePrompt;
        return Flux.range(1, safeImageCount)
            .concatMap(index -> requestApiYiGeminiImage(endpoint, config, effectivePrompt, normalizedImageInputs))
            .collectList()
            .retryWhen(
                Retry.backoff(TRANSIENT_ERROR_RETRY_COUNT, TRANSIENT_ERROR_RETRY_BACKOFF)
                    .filter(ProviderErrorClassifier::isRetryableImageError)
            )
            .timeout(REQUEST_IDLE_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException("Image edit timed out after 180s without response.")
            )
            .doOnError(ex -> log.warn("APIYi Gemini image edit failed for {}: {}", config.getName(), ex.getMessage()));
    }

    private Mono<List<String>> generateDashScopeQwenImages(
        AiApiConfig config,
        String prompt,
        int imageCount,
        List<ImageInput> imageInputs
    ) {
        String endpoint = ProviderUrlBuilder.buildDashScopeAigcMultimodalGenerationEndpoint(config.getBaseUrl());
        int safeImageCount = ProviderProtocolSupport.normalizeQwenImageEditImageCount(config.getModelName(), imageCount);
        List<ImageInput> normalizedImageInputs = ProviderImageSupport.normalizeImageInputs(imageInputs);
        String safePrompt = ProviderImageSupport.buildReferenceAwarePrompt(prompt, normalizedImageInputs);
        String effectivePrompt = safePrompt.isBlank() ? "Generate a high-quality image." : safePrompt;

        List<Map<String, Object>> content = new ArrayList<>();
        for (ImageInput imageInput : normalizedImageInputs) {
            String safeMimeType = ProviderImageSupport.normalizeImageMimeType(imageInput == null ? null : imageInput.getMimeType());
            String safeBase64 = ProviderImageSupport.extractBase64Payload(imageInput == null ? null : imageInput.getData());
            if (safeBase64.isBlank()) {
                continue;
            }
            String dataUrl = "data:" + safeMimeType + ";base64," + safeBase64;
            content.add(Map.of("image", dataUrl));
        }
        content.add(Map.of("text", effectivePrompt));

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", config.getModelName());
        requestBody.put("input", Map.of(
            "messages", List.of(Map.of(
                "role", "user",
                "content", content
            ))
        ));
        requestBody.put("parameters", Map.of(
            "n", safeImageCount,
            "watermark", false
        ));

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .bodyValue(requestBody)
            .exchangeToMono(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMap(body -> {
                            try {
                                return Mono.just(ProviderResponseParsers.extractDashScopeWanImagesOrError(objectMapper, body));
                            } catch (RuntimeException ex) {
                                return Mono.error(ex);
                            }
                        });
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> Mono.error(buildHttpException(response.statusCode().value(), body)));
            })
            .retryWhen(
                Retry.backoff(TRANSIENT_ERROR_RETRY_COUNT, TRANSIENT_ERROR_RETRY_BACKOFF)
                    .filter(ProviderErrorClassifier::isRetryableImageError)
            )
            .timeout(REQUEST_IDLE_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException("Qwen image request timed out after 180s without response.")
            )
            .doOnError(ex -> log.warn("Qwen image request failed for {}: {}", config.getName(), ex.getMessage()));
    }

    private Mono<String> requestApiYiGeminiImage(
        String endpoint,
        AiApiConfig config,
        String prompt,
        List<ImageInput> imageInputs
    ) {
        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", prompt));
        for (ImageInput imageInput : imageInputs) {
            String mimeType = ProviderImageSupport.normalizeImageMimeType(imageInput == null ? null : imageInput.getMimeType());
            String base64 = ProviderImageSupport.extractBase64Payload(imageInput == null ? null : imageInput.getData());
            if (base64.isBlank()) {
                continue;
            }
            parts.add(Map.of("inlineData", Map.of("mimeType", mimeType, "data", base64)));
        }
        if (parts.size() <= 1) {
            return Mono.error(new RuntimeException("Image input is empty"));
        }

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("contents", List.of(Map.of(
            "role", "user",
            "parts", parts
        )));
        requestBody.put("generationConfig", Map.of("responseModalities", List.of("IMAGE")));

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .bodyValue(requestBody)
            .exchangeToMono(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMap(body -> {
                            try {
                                List<String> outputs = ProviderResponseParsers.extractGeminiContentImagesOrError(objectMapper, body);
                                if (outputs.isEmpty()) {
                                    return Mono.error(new RuntimeException("Image generation returned no images"));
                                }
                                return Mono.just(outputs.get(0));
                            } catch (RuntimeException ex) {
                                return Mono.error(ex);
                            }
                        });
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> Mono.error(buildHttpException(response.statusCode().value(), body)));
            });
    }

    private Mono<List<String>> generateDashScopeWanImages(AiApiConfig config, String prompt, int imageCount) {
        String endpoint = ProviderUrlBuilder.buildDashScopeWanEndpoint(config.getBaseUrl());
        int safeImageCount = Math.max(1, Math.min(imageCount, 4));
        String safePrompt = prompt == null ? "" : prompt.trim();

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", config.getModelName());
        requestBody.put("input", Map.of(
            "messages", List.of(Map.of(
                "role", "user",
                "content", List.of(Map.of("text", safePrompt))
            ))
        ));
        requestBody.put("parameters", Map.of(
            "n", safeImageCount,
            "watermark", false,
            "prompt_extend", true
        ));

        return webClient.post()
            .uri(endpoint)
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + config.getApiKey())
            .bodyValue(requestBody)
            .exchangeToMono(response -> {
                if (response.statusCode().is2xxSuccessful()) {
                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMap(body -> {
                            try {
                                return Mono.just(ProviderResponseParsers.extractDashScopeWanImagesOrError(objectMapper, body));
                            } catch (RuntimeException ex) {
                                return Mono.error(ex);
                            }
                        });
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMap(body -> Mono.error(buildHttpException(response.statusCode().value(), body)));
            })
            .retryWhen(
                Retry.backoff(TRANSIENT_ERROR_RETRY_COUNT, TRANSIENT_ERROR_RETRY_BACKOFF)
                    .filter(ProviderErrorClassifier::isRetryableImageError)
            )
            .timeout(REQUEST_IDLE_TIMEOUT)
            .onErrorMap(TimeoutException.class, ex ->
                new RuntimeException("Wan image generation timed out after 180s without response.")
            )
            .doOnError(ex -> log.warn("Wan image generation failed for {}: {}", config.getName(), ex.getMessage()));
    }

    private Flux<StreamChunk> extractChunkOrError(String data) {
        try {
            List<ProviderResponseParsers.ParsedStreamChunk> parsedChunks =
                ProviderResponseParsers.extractStreamChunksOrError(objectMapper, data);
            List<StreamChunk> chunks = new ArrayList<>();
            for (ProviderResponseParsers.ParsedStreamChunk parsedChunk : parsedChunks) {
                chunks.add(new StreamChunk(parsedChunk.delta(), parsedChunk.usage()));
            }
            return chunks.isEmpty() ? Flux.empty() : Flux.fromIterable(chunks);
        } catch (RuntimeException ex) {
            return Flux.error(ex);
        }
    }

    private RuntimeException buildHttpException(int status, String body) {
        String suffix = ProviderResponseParsers.extractProviderError(objectMapper, body);
        if (suffix.isBlank()) {
            return new RuntimeException("HTTP " + status + " from provider");
        }
        return new RuntimeException("HTTP " + status + ": " + suffix);
    }

    private boolean isApiYiBaseUrl(AiApiConfig config) {
        return ProviderUrlBuilder.isApiYiBaseUrl(config == null ? null : config.getBaseUrl());
    }
}

