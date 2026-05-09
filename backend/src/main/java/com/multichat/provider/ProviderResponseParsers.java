package com.multichat.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.model.TokenUsage;
import java.util.ArrayList;
import java.util.List;

public final class ProviderResponseParsers {

    public record ParsedStreamChunk(String delta, TokenUsage usage) {
    }

    private ProviderResponseParsers() {
    }

    public static List<ParsedStreamChunk> extractStreamChunksOrError(ObjectMapper objectMapper, String data) {
        if ("[DONE]".equals(data)) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(data);

            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String providerError = errorNode.path("message").asText();
                if (providerError == null || providerError.isBlank()) {
                    providerError = errorNode.toString();
                }
                throw new ProviderResponseException(providerError);
            }

            TokenUsage usage = readTokenUsage(root.path("usage"));
            JsonNode choices = root.path("choices");
            List<String> parts = new ArrayList<>();
            if (choices.isArray() && !choices.isEmpty()) {
                JsonNode firstChoice = choices.get(0);
                collectContent(firstChoice.path("delta").path("content"), parts);
                collectContent(firstChoice.path("message").path("content"), parts);
            }

            List<ParsedStreamChunk> chunks = new ArrayList<>();
            for (String part : parts) {
                if (part != null && !part.isBlank()) {
                    chunks.add(new ParsedStreamChunk(part, null));
                }
            }
            if (usage != null) {
                chunks.add(new ParsedStreamChunk("", usage));
            }

            return chunks;
        } catch (ProviderResponseException ex) {
            throw ex;
        } catch (Exception ex) {
            return List.of();
        }
    }

    public static List<String> extractDashScopeWanImagesOrError(ObjectMapper objectMapper, String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(body);

            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String providerError = errorNode.path("message").asText();
                if (providerError == null || providerError.isBlank()) {
                    providerError = errorNode.toString();
                }
                throw new RuntimeException(providerError);
            }

            String code = root.path("code").asText();
            if (code != null && !code.isBlank()) {
                String message = root.path("message").asText();
                if (message == null || message.isBlank()) {
                    message = code;
                } else {
                    message = code + ": " + message;
                }
                throw new RuntimeException(message);
            }

            List<String> outputs = new ArrayList<>();
            JsonNode choices = root.path("output").path("choices");
            if (choices.isArray()) {
                for (JsonNode choice : choices) {
                    collectDashScopeContentImages(choice.path("message").path("content"), outputs);
                }
            }

            if (outputs.isEmpty()) {
                collectImageList(root.path("data"), outputs);
                collectImageList(root.path("images"), outputs);
            }

            return outputs;
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            return List.of();
        }
    }

    public static List<String> extractImageOutputsOrError(ObjectMapper objectMapper, String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(body);

            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String providerError = errorNode.path("message").asText();
                if (providerError == null || providerError.isBlank()) {
                    providerError = errorNode.toString();
                }
                throw new RuntimeException(providerError);
            }

            List<String> outputs = new ArrayList<>();
            collectImageList(root.path("data"), outputs);
            collectImageList(root.path("output"), outputs);
            collectImageList(root.path("images"), outputs);

            return outputs;
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            return List.of();
        }
    }

    public static List<String> extractGeminiContentImagesOrError(ObjectMapper objectMapper, String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }

        try {
            JsonNode root = objectMapper.readTree(body);

            JsonNode errorNode = root.path("error");
            if (!errorNode.isMissingNode() && !errorNode.isNull()) {
                String providerError = errorNode.path("message").asText();
                if (providerError == null || providerError.isBlank()) {
                    providerError = errorNode.toString();
                }
                throw new RuntimeException(providerError);
            }

            List<String> outputs = new ArrayList<>();
            JsonNode candidates = root.path("candidates");
            if (candidates.isArray()) {
                for (JsonNode candidate : candidates) {
                    collectGeminiInlineDataImages(candidate.path("content").path("parts"), outputs);
                }
            }

            if (outputs.isEmpty()) {
                collectImageList(root.path("data"), outputs);
                collectImageList(root.path("images"), outputs);
            }

            return outputs;
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            return List.of();
        }
    }

    public static String extractProviderError(ObjectMapper objectMapper, String body) {
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

    private static TokenUsage readTokenUsage(JsonNode usageNode) {
        if (usageNode == null || usageNode.isMissingNode() || usageNode.isNull() || !usageNode.isObject()) {
            return null;
        }

        Integer promptTokens = firstInt(usageNode, "prompt_tokens", "input_tokens");
        Integer completionTokens = firstInt(usageNode, "completion_tokens", "output_tokens");
        Integer totalTokens = firstInt(usageNode, "total_tokens");

        if (totalTokens == null && promptTokens != null && completionTokens != null) {
            totalTokens = promptTokens + completionTokens;
        }

        if (promptTokens == null && completionTokens == null && totalTokens == null) {
            return null;
        }

        return TokenUsage.builder()
            .promptTokens(promptTokens)
            .completionTokens(completionTokens)
            .totalTokens(totalTokens)
            .build();
    }

    private static Integer firstInt(JsonNode node, String... fieldNames) {
        if (node == null || fieldNames == null) {
            return null;
        }
        for (String fieldName : fieldNames) {
            if (fieldName == null || fieldName.isBlank()) {
                continue;
            }
            JsonNode valueNode = node.path(fieldName);
            if (!valueNode.isMissingNode() && !valueNode.isNull() && valueNode.canConvertToInt()) {
                int value = valueNode.asInt();
                if (value >= 0) {
                    return value;
                }
            }
        }
        return null;
    }

    private static void collectContent(JsonNode contentNode, List<String> parts) {
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

    private static boolean isReasoningNode(JsonNode node) {
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

    private static void collectDashScopeContentImages(JsonNode contentNode, List<String> outputs) {
        if (contentNode == null || contentNode.isMissingNode() || contentNode.isNull() || !contentNode.isArray()) {
            return;
        }

        for (JsonNode node : contentNode) {
            if (node == null || node.isNull()) {
                continue;
            }

            String image = node.path("image").asText();
            if (image != null && !image.isBlank()) {
                outputs.add(image.trim());
                continue;
            }

            String url = node.path("url").asText();
            if (url != null && !url.isBlank()) {
                outputs.add(url.trim());
            }
        }
    }

    private static void collectImageList(JsonNode listNode, List<String> outputs) {
        if (listNode == null || listNode.isMissingNode() || listNode.isNull() || !listNode.isArray()) {
            return;
        }

        for (JsonNode item : listNode) {
            if (item == null || item.isNull()) {
                continue;
            }

            String url = item.path("url").asText();
            if (url != null && !url.isBlank()) {
                outputs.add(url.trim());
                continue;
            }

            JsonNode imageUrlNode = item.path("image_url");
            if (imageUrlNode.isTextual()) {
                String imageUrl = imageUrlNode.asText();
                if (imageUrl != null && !imageUrl.isBlank()) {
                    outputs.add(imageUrl.trim());
                    continue;
                }
            }

            String base64 = item.path("b64_json").asText();
            if (base64 == null || base64.isBlank()) {
                base64 = item.path("base64").asText();
            }
            if (base64 != null && !base64.isBlank()) {
                String normalized = base64.trim();
                if (normalized.startsWith("data:image/")) {
                    outputs.add(normalized);
                } else {
                    outputs.add("data:image/png;base64," + normalized);
                }
            }
        }
    }

    private static void collectGeminiInlineDataImages(JsonNode partsNode, List<String> outputs) {
        if (partsNode == null || partsNode.isMissingNode() || partsNode.isNull() || !partsNode.isArray()) {
            return;
        }
        for (JsonNode part : partsNode) {
            if (part == null || part.isNull()) {
                continue;
            }
            JsonNode inlineDataNode = part.path("inlineData");
            if (inlineDataNode.isMissingNode() || inlineDataNode.isNull()) {
                inlineDataNode = part.path("inline_data");
            }
            if (inlineDataNode.isMissingNode() || inlineDataNode.isNull()) {
                continue;
            }

            String data = inlineDataNode.path("data").asText();
            if (data == null || data.isBlank()) {
                continue;
            }

            String mimeType = inlineDataNode.path("mimeType").asText();
            if (mimeType == null || mimeType.isBlank()) {
                mimeType = inlineDataNode.path("mime_type").asText();
            }
            if (mimeType == null || mimeType.isBlank()) {
                mimeType = "image/png";
            }
            outputs.add("data:" + mimeType.trim() + ";base64," + data.trim());
        }
    }

    private static final class ProviderResponseException extends RuntimeException {
        private ProviderResponseException(String message) {
            super(message);
        }
    }
}
