package com.multichat.provider;

import java.io.IOException;

public final class ProviderErrorClassifier {

    private ProviderErrorClassifier() {
    }

    public static boolean isRateLimitError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase();
                if (
                    normalized.contains("http 429") ||
                    normalized.contains("throttling.ratequota") ||
                    normalized.contains("rate limit")
                ) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    public static boolean isProviderServerError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase();
                if (
                    normalized.contains("http 500") ||
                    normalized.contains("http 502") ||
                    normalized.contains("http 503") ||
                    normalized.contains("http 504")
                ) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    public static boolean isTransientNetworkError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof IOException) {
                return true;
            }

            String className = current.getClass().getName();
            if (className != null) {
                String normalizedClass = className.toLowerCase();
                if (
                    normalizedClass.contains("prematurecloseexception") ||
                    normalizedClass.contains("readtimeoutexception") ||
                    normalizedClass.contains("connecttimeoutexception")
                ) {
                    return true;
                }
            }

            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase();
                if (
                    normalized.contains("connection reset") ||
                    normalized.contains("connection prematurely closed") ||
                    normalized.contains("broken pipe") ||
                    normalized.contains("connection refused") ||
                    normalized.contains("connection abort") ||
                    normalized.contains("read timed out") ||
                    normalized.contains("connect timed out") ||
                    normalized.contains("network is unreachable")
                ) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    public static boolean isRetryableImageError(Throwable error) {
        return isRateLimitError(error) || isProviderServerError(error) || isTransientNetworkError(error);
    }

    public static boolean isUsageUnsupportedError(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase();
                if (
                    normalized.contains("stream_options") ||
                    normalized.contains("include_usage") ||
                    normalized.contains("unsupported parameter") ||
                    normalized.contains("unknown parameter")
                ) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }
}
