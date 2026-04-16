package com.multichat.util;

public final class ClientIdResolver {

    public static final String HEADER_NAME = "X-Client-Id";
    private static final String FALLBACK_CLIENT_ID = "web-anonymous";

    private ClientIdResolver() {
    }

    public static String resolve(String raw) {
        if (raw == null) {
            return FALLBACK_CLIENT_ID;
        }
        String normalized = raw.trim();
        if (normalized.isEmpty()) {
            return FALLBACK_CLIENT_ID;
        }
        return normalized;
    }
}
