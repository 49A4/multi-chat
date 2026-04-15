package com.multichat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.model.AiApiConfig;
import com.multichat.model.ChatMessage;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

@Slf4j
@Service
@RequiredArgsConstructor
public class OpenAiCompatClient {

    private static final Duration REQUEST_IDLE_TIMEOUT = Duration.ofSeconds(180);
    private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE_STRING_TYPE =
        new ParameterizedTypeReference<>() { };

    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public Flux<String> streamCompletion(AiApiConfig config, List<ChatMessage> context) {
        String endpoint = buildCompletionsEndpoint(config.getBaseUrl());

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", config.getModelName());
        requestBody.put("stream", true);
        requestBody.put("max_tokens", config.getMaxTokens());
        requestBody.put("temperature", config.getTemperature());
        requestBody.put("messages", context.stream()
            .map(msg -> Map.of("role", msg.getRole(), "content", msg.getContent()))
            .toList());

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
                                return extractTextOrError(data.trim());
                            });
                    }

                    return response.bodyToMono(String.class)
                        .defaultIfEmpty("")
                        .flatMapMany(this::extractTextOrError);
                }
                return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMapMany(body -> Flux.error(buildHttpException(response.statusCode().value(), body)));
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

    private Flux<String> extractTextOrError(String data) {
        if ("[DONE]".equals(data)) {
            return Flux.empty();
        }

        try {
            JsonNode root = objectMapper.readTree(data);

            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String providerError = errorNode.path("message").asText();
                if (providerError == null || providerError.isBlank()) {
                    providerError = errorNode.toString();
                }
                return Flux.error(new RuntimeException(providerError));
            }

            JsonNode choices = root.path("choices");
            if (!choices.isArray() || choices.isEmpty()) {
                return Flux.empty();
            }

            JsonNode firstChoice = choices.get(0);
            List<String> parts = new ArrayList<>();
            collectContent(firstChoice.path("delta").path("content"), parts);
            collectContent(firstChoice.path("message").path("content"), parts);

            return Flux.fromIterable(parts)
                .filter(part -> part != null && !part.isBlank());
        } catch (Exception ex) {
            return Flux.empty();
        }
    }

    private RuntimeException buildHttpException(int status, String body) {
        String suffix = extractProviderError(body);
        if (suffix.isBlank()) {
            return new RuntimeException("HTTP " + status + " from provider");
        }
        return new RuntimeException("HTTP " + status + ": " + suffix);
    }

    private String extractProviderError(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String message = errorNode.path("message").asText();
                if (message != null && !message.isBlank()) {
                    return message;
                }
                return errorNode.toString();
            }
        } catch (Exception ignore) {
            // Keep raw body fallback.
        }
        return body.length() > 240 ? body.substring(0, 240) + "..." : body;
    }

    private void collectContent(JsonNode contentNode, List<String> parts) {
        if (contentNode == null || contentNode.isMissingNode() || contentNode.isNull()) {
            return;
        }

        if (contentNode.isTextual()) {
            parts.add(contentNode.asText());
            return;
        }

        if (contentNode.isArray()) {
            for (JsonNode node : contentNode) {
                if (node.isTextual()) {
                    parts.add(node.asText());
                } else if (node.has("text") && node.get("text").isTextual() && !isReasoningNode(node)) {
                    parts.add(node.get("text").asText());
                } else if (node.has("content") && node.get("content").isTextual() && !isReasoningNode(node)) {
                    parts.add(node.get("content").asText());
                }
            }
            return;
        }

        if (
            contentNode.isObject() &&
            contentNode.has("text") &&
            contentNode.get("text").isTextual() &&
            !isReasoningNode(contentNode)
        ) {
            parts.add(contentNode.get("text").asText());
        }
    }

    private boolean isReasoningNode(JsonNode node) {
        if (node == null || !node.isObject()) {
            return false;
        }
        String type = node.path("type").asText("");
        if (type == null || type.isBlank()) {
            return false;
        }
        String normalized = type.toLowerCase();
        return normalized.contains("reasoning") || normalized.contains("thinking") || normalized.contains("thought");
    }

    private String normalizeBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    private String buildCompletionsEndpoint(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        if (baseUrl.endsWith("/v1")) {
            return baseUrl + "/chat/completions";
        }
        return baseUrl + "/v1/chat/completions";
    }
}
