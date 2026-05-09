package com.multichat.provider;

public final class ProviderUrlBuilder {

    private ProviderUrlBuilder() {
    }

    public static String normalizeBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public static String buildCompletionsEndpoint(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        if (baseUrl.endsWith("/v1")) {
            return baseUrl + "/chat/completions";
        }
        return baseUrl + "/v1/chat/completions";
    }

    public static String buildImagesEndpoint(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        if (baseUrl.endsWith("/v1")) {
            return baseUrl + "/images/generations";
        }
        return baseUrl + "/v1/images/generations";
    }

    public static String buildImageEditsEndpoint(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        if (baseUrl.endsWith("/v1")) {
            return baseUrl + "/images/edits";
        }
        return baseUrl + "/v1/images/edits";
    }

    public static String buildApiYiGeminiGenerateContentEndpoint(String rawBaseUrl, String modelName) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        String safeModelName = modelName == null ? "" : modelName.trim();
        if (safeModelName.isBlank()) {
            throw new RuntimeException("Model name is required for image edit request");
        }

        if (baseUrl.endsWith("/v1beta")) {
            return baseUrl + "/models/" + safeModelName + ":generateContent";
        }
        if (baseUrl.endsWith("/v1")) {
            return baseUrl.substring(0, baseUrl.length() - 3) + "/v1beta/models/" + safeModelName + ":generateContent";
        }
        return baseUrl + "/v1beta/models/" + safeModelName + ":generateContent";
    }

    public static String buildDashScopeAigcMultimodalGenerationEndpoint(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        String root = baseUrl;

        if (baseUrl.endsWith("/compatible-mode/v1")) {
            root = baseUrl.substring(0, baseUrl.length() - "/compatible-mode/v1".length());
        } else if (baseUrl.endsWith("/v1")) {
            root = baseUrl.substring(0, baseUrl.length() - "/v1".length());
        }

        return root + "/api/v1/services/aigc/multimodal-generation/generation";
    }

    public static String buildDashScopeWanEndpoint(String rawBaseUrl) {
        return buildDashScopeAigcMultimodalGenerationEndpoint(rawBaseUrl);
    }

    public static boolean isApiYiBaseUrl(String rawBaseUrl) {
        return normalizeBaseUrl(rawBaseUrl).toLowerCase().contains("apiyi.com");
    }

    public static boolean isDashScopeBaseUrl(String rawBaseUrl) {
        String baseUrl = normalizeBaseUrl(rawBaseUrl).toLowerCase();
        return baseUrl.contains("dashscope") || baseUrl.contains("aliyuncs.com");
    }
}
