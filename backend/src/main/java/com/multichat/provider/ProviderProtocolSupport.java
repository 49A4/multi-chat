package com.multichat.provider;

import com.multichat.dto.ImageInput;
import com.multichat.model.AiApiConfig;
import java.util.List;

public final class ProviderProtocolSupport {

    private ProviderProtocolSupport() {
    }

    public static boolean usesOpenAiGptImage2EditProtocol(AiApiConfig config, List<ImageInput> imageInputs) {
        if (config == null || !ProviderImageSupport.hasValidImageInputs(imageInputs)) {
            return false;
        }
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        return modelName.startsWith("gpt-image-2");
    }

    public static boolean usesApiYiGeminiImageEditProtocol(AiApiConfig config, List<ImageInput> imageInputs) {
        if (config == null || !ProviderImageSupport.hasValidImageInputs(imageInputs)) {
            return false;
        }
        String baseUrl = ProviderUrlBuilder.normalizeBaseUrl(config.getBaseUrl()).toLowerCase();
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        return baseUrl.contains("apiyi") &&
            (modelName.contains("gemini-3.1-flash-image-preview") || modelName.contains("nanobanana"));
    }

    public static boolean usesDashScopeWanProtocol(AiApiConfig config) {
        if (config == null) {
            return false;
        }
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        if (modelName.isBlank()) {
            return false;
        }
        if (!modelName.startsWith("wan2.") && !modelName.startsWith("wan-") && !modelName.contains("wan2.6")) {
            return false;
        }

        return ProviderUrlBuilder.isDashScopeBaseUrl(config.getBaseUrl());
    }

    public static boolean usesDashScopeQwenImageProtocol(AiApiConfig config) {
        if (config == null) {
            return false;
        }
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        if (!modelName.contains("qwen-image-edit") && !modelName.startsWith("qwen-image-2.0")) {
            return false;
        }
        return ProviderUrlBuilder.isDashScopeBaseUrl(config.getBaseUrl());
    }

    public static int normalizeQwenImageEditImageCount(String modelName, int rawCount) {
        int safeRawCount = Math.max(1, Math.min(rawCount, 8));
        String normalizedModelName = modelName == null ? "" : modelName.trim().toLowerCase();
        if (
            normalizedModelName.contains("qwen-image-edit-plus") ||
            normalizedModelName.contains("qwen-image-edit-max") ||
            normalizedModelName.contains("qwen-image-2.0")
        ) {
            return Math.max(1, Math.min(safeRawCount, 6));
        }
        return 1;
    }
}
