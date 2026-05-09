package com.multichat.util;

public final class ClientIdResolver {

    public static final String HEADER_NAME = "X-Client-Id";
    public static final String USER_HEADER_NAME = "X-User-Id";
    private static final String FALLBACK_CLIENT_ID = "web-anonymous";

    private ClientIdResolver() {
    }

    public static String resolve(String raw) {
        return resolve(raw, null);
    }

    public static String resolve(String clientIdRaw, String userIdRaw) {
        String normalizedUserId = normalize(userIdRaw);
        if (normalizedUserId != null) {
            return normalizedUserId;
        }

        String normalizedClientId = normalize(clientIdRaw);
        if (normalizedClientId != null) {
            return normalizedClientId;
        }

        return FALLBACK_CLIENT_ID;
    }

    private static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        return normalized;
    }
}
