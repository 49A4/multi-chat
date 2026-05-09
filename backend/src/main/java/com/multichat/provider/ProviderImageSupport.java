package com.multichat.provider;

import com.multichat.dto.ImageInput;
import com.multichat.model.AiApiConfig;
import java.util.ArrayList;
import java.util.List;

public final class ProviderImageSupport {

    private ProviderImageSupport() {
    }

    public static boolean hasValidImageInput(ImageInput imageInput) {
        if (imageInput == null) {
            return false;
        }
        return !extractBase64Payload(imageInput.getData()).isBlank();
    }

    public static boolean hasValidImageInputs(List<ImageInput> imageInputs) {
        if (imageInputs == null || imageInputs.isEmpty()) {
            return false;
        }
        for (ImageInput imageInput : imageInputs) {
            if (hasValidImageInput(imageInput)) {
                return true;
            }
        }
        return false;
    }

    public static List<ImageInput> normalizeImageInputs(List<ImageInput> imageInputs) {
        if (imageInputs == null || imageInputs.isEmpty()) {
            return List.of();
        }
        List<ImageInput> normalized = new ArrayList<>();
        for (ImageInput item : imageInputs) {
            if (!hasValidImageInput(item)) {
                continue;
            }
            normalized.add(copyImageInputWithMetadata(item, normalized.size()));
            if (normalized.size() >= 8) {
                break;
            }
        }
        if (normalized.isEmpty()) {
            return List.of();
        }
        return List.copyOf(normalized);
    }

    public static String buildReferenceAwarePrompt(String prompt, List<ImageInput> imageInputs) {
        String safePrompt = prompt == null ? "" : prompt.trim();
        List<ImageInput> normalizedInputs = normalizeImageInputs(imageInputs);
        if (normalizedInputs.size() <= 1) {
            return safePrompt;
        }

        StringBuilder builder = new StringBuilder();
        builder.append("Reference image role rules:\n");
        for (int index = 0; index < normalizedInputs.size(); index++) {
            ImageInput imageInput = normalizedInputs.get(index);
            String role = normalizeImageRole(imageInput.getRole(), index);
            int order = imageInput.getOrder() != null && imageInput.getOrder() > 0 ? imageInput.getOrder() : index + 1;
            builder.append("- Image ").append(order).append(" is ").append(describeImageRole(role)).append(".\n");
        }
        builder.append("Do not swap the roles of the reference images. ");
        builder.append("If Image 1 is target/base, preserve its body, pose, clothing, background, lighting, and composition. ");
        builder.append("If Image 2 is face_reference, use it only for facial identity and do not copy its pose, clothing, or background.\n\n");
        if (!safePrompt.isBlank()) {
            builder.append(safePrompt);
        }
        return builder.toString().trim();
    }

    public static String normalizeImageRole(String rawRole) {
        return normalizeImageRole(rawRole, 0);
    }

    public static String normalizeImageAspectRatio(String rawAspectRatio) {
        String aspectRatio = rawAspectRatio == null ? "" : rawAspectRatio.trim();
        if (aspectRatio.isBlank()) {
            return "3:4";
        }
        return switch (aspectRatio) {
            case "1:1", "3:4", "4:3", "9:16", "16:9" -> aspectRatio;
            default -> "3:4";
        };
    }

    public static String normalizeImageQuality(String rawQuality) {
        String quality = rawQuality == null ? "" : rawQuality.trim().toLowerCase();
        if (quality.isBlank()) {
            return "high";
        }
        return switch (quality) {
            case "low", "medium", "high", "auto" -> quality;
            default -> "high";
        };
    }

    public static String resolveOpenAiImageSize(String rawAspectRatio) {
        String aspectRatio = normalizeImageAspectRatio(rawAspectRatio);
        return switch (aspectRatio) {
            case "4:3", "16:9" -> "1536x1024";
            case "1:1" -> "1024x1024";
            default -> "1024x1536";
        };
    }

    public static boolean usesOpenAiImageModel(AiApiConfig config) {
        if (config == null) {
            return false;
        }
        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        return modelName.startsWith("gpt-image");
    }

    public static String normalizeImageMimeType(String rawMimeType) {
        String mimeType = rawMimeType == null ? "" : rawMimeType.trim();
        if (!mimeType.startsWith("image/")) {
            return "image/png";
        }
        return mimeType;
    }

    public static String guessImageExtension(String mimeType) {
        String normalized = normalizeImageMimeType(mimeType).toLowerCase();
        if (normalized.contains("jpeg") || normalized.contains("jpg")) {
            return ".jpg";
        }
        if (normalized.contains("webp")) {
            return ".webp";
        }
        if (normalized.contains("gif")) {
            return ".gif";
        }
        if (normalized.contains("bmp")) {
            return ".bmp";
        }
        if (normalized.contains("svg")) {
            return ".svg";
        }
        if (normalized.contains("avif")) {
            return ".avif";
        }
        return ".png";
    }

    public static String extractBase64Payload(String rawData) {
        if (rawData == null) {
            return "";
        }
        String value = rawData.trim();
        if (value.isBlank()) {
            return "";
        }
        int markerIndex = value.indexOf("base64,");
        if (markerIndex >= 0) {
            return value.substring(markerIndex + 7).trim();
        }
        return value;
    }

    public static String resolveOpenAiImageFieldName(AiApiConfig config) {
        String baseUrl = ProviderUrlBuilder.normalizeBaseUrl(config == null ? null : config.getBaseUrl()).toLowerCase();
        if (baseUrl.contains("apiyi.com")) {
            return "image[]";
        }
        return "image";
    }

    private static ImageInput copyImageInputWithMetadata(ImageInput source, int index) {
        ImageInput normalized = new ImageInput();
        normalized.setMimeType(source.getMimeType() == null ? "" : source.getMimeType().trim());
        normalized.setData(source.getData() == null ? "" : source.getData().trim());
        normalized.setOrder(source.getOrder() != null && source.getOrder() > 0 ? source.getOrder() : index + 1);
        normalized.setRole(normalizeImageRole(source.getRole(), index));
        normalized.setName(source.getName() == null ? "" : source.getName().trim());
        return normalized;
    }

    private static String normalizeImageRole(String rawRole, int index) {
        String role = rawRole == null ? "" : rawRole.trim().toLowerCase();
        if (!role.isBlank()) {
            return role.replaceAll("[^a-z0-9_\\-]", "_");
        }
        return switch (index) {
            case 0 -> "target";
            case 1 -> "face_reference";
            default -> "reference";
        };
    }

    private static String describeImageRole(String role) {
        return switch (normalizeImageRole(role)) {
            case "target", "base", "target_image" -> "TARGET/BASE image";
            case "face_reference", "face", "identity", "source_face" -> "FACE IDENTITY reference only";
            default -> "additional visual reference";
        };
    }
}
