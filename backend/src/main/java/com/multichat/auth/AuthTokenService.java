package com.multichat.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class AuthTokenService {

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final ObjectMapper objectMapper;
    private final byte[] secretBytes;
    private final long ttlSeconds;

    public AuthTokenService(
        ObjectMapper objectMapper,
        @Value("${multichat.auth.token-secret:please-change-me}") String tokenSecret,
        @Value("${multichat.auth.token-ttl-hours:720}") long tokenTtlHours
    ) {
        this.objectMapper = objectMapper;
        String normalizedSecret = tokenSecret == null ? "" : tokenSecret.trim();
        if (normalizedSecret.isBlank()) {
            normalizedSecret = "please-change-me";
        }
        this.secretBytes = normalizedSecret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = Math.max(3600L, tokenTtlHours * 3600L);
    }

    public IssuedToken issueToken(String userId) {
        String normalizedUserId = normalize(userId);
        if (normalizedUserId == null) {
            throw new IllegalArgumentException("userId cannot be blank");
        }

        long issuedAt = Instant.now().getEpochSecond();
        long expiresAt = issuedAt + ttlSeconds;
        String token = signPayload(Map.of(
            "uid", normalizedUserId,
            "iat", issuedAt,
            "exp", expiresAt
        ));
        return new IssuedToken(normalizedUserId, token, expiresAt * 1000L);
    }

    public VerifiedToken verifyToken(String rawToken) {
        String token = normalize(rawToken);
        if (token == null) {
            return null;
        }

        int boundary = token.indexOf('.');
        if (boundary <= 0 || boundary >= token.length() - 1) {
            return null;
        }

        String encodedPayload = token.substring(0, boundary);
        String encodedSignature = token.substring(boundary + 1);
        String expectedSignature = sign(encodedPayload);
        if (!secureEquals(encodedSignature, expectedSignature)) {
            return null;
        }

        try {
            byte[] payloadBytes = Base64.getUrlDecoder().decode(encodedPayload);
            JsonNode payloadNode = objectMapper.readTree(payloadBytes);
            String userId = normalize(payloadNode.path("uid").asText(null));
            long expiresAt = payloadNode.path("exp").asLong(0L);
            if (userId == null || expiresAt <= 0L) {
                return null;
            }
            long now = Instant.now().getEpochSecond();
            if (now >= expiresAt) {
                return null;
            }
            return new VerifiedToken(userId, expiresAt * 1000L);
        } catch (Exception ex) {
            log.debug("Failed to parse auth token: {}", ex.getMessage());
            return null;
        }
    }

    private String signPayload(Map<String, Object> payload) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(payload);
            String encodedPayload = Base64.getUrlEncoder().withoutPadding().encodeToString(json);
            String signature = sign(encodedPayload);
            return encodedPayload + "." + signature;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to issue auth token", ex);
        }
    }

    private String sign(String encodedPayload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secretBytes, HMAC_ALGORITHM));
            byte[] signature = mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(signature);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to sign auth token", ex);
        }
    }

    private boolean secureEquals(String left, String right) {
        byte[] a = left == null ? new byte[0] : left.getBytes(StandardCharsets.UTF_8);
        byte[] b = right == null ? new byte[0] : right.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(a, b);
    }

    private String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String normalized = raw.trim();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized;
    }

    public record IssuedToken(String userId, String token, long expiresAt) {
    }

    public record VerifiedToken(String userId, long expiresAt) {
    }
}

