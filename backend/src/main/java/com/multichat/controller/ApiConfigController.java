package com.multichat.controller;

import com.multichat.exception.ApiException;
import com.multichat.model.AiApiConfig;
import com.multichat.store.ApiConfigStore;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.multichat.util.ClientIdResolver;

@RestController
@RequestMapping("/api/configs")
@RequiredArgsConstructor
public class ApiConfigController {

    private final ApiConfigStore apiConfigStore;

    @GetMapping
    public List<AiApiConfig> findAll(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return apiConfigStore.findAll(ownerId);
    }

    @PostMapping
    public AiApiConfig create(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @Valid @RequestBody AiApiConfig request
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        if (request.getId() == null || request.getId().isBlank()) {
            request.setId(UUID.randomUUID().toString());
        }
        normalizeBaseUrl(request);
        normalizeModelName(request);
        normalizeApiType(request);
        return apiConfigStore.save(ownerId, request);
    }

    @PutMapping("/{id}")
    public AiApiConfig update(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id,
        @Valid @RequestBody AiApiConfig request
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        String normalizedId = normalizeConfigId(id);
        AiApiConfig existing = apiConfigStore.findById(ownerId, normalizedId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + normalizedId));

        request.setId(existing.getId());
        normalizeBaseUrl(request);
        normalizeModelName(request);
        normalizeApiType(request);
        return apiConfigStore.save(ownerId, request);
    }

    @PatchMapping("/{id}/toggle")
    public AiApiConfig toggle(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        String normalizedId = normalizeConfigId(id);
        AiApiConfig config = apiConfigStore.findById(ownerId, normalizedId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + normalizedId));

        config.setEnabled(!Boolean.TRUE.equals(config.getEnabled()));
        return apiConfigStore.save(ownerId, config);
    }

    @DeleteMapping("/{id}")
    public void delete(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        String normalizedId = normalizeConfigId(id);
        boolean removed = apiConfigStore.deleteById(ownerId, normalizedId);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + normalizedId);
        }
    }

    private String normalizeConfigId(String rawId) {
        String text = rawId == null ? "" : rawId.trim();
        if (text.isEmpty()) {
            return text;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
            .matcher(text);
        if (matcher.find()) {
            return matcher.group(0);
        }
        return text;
    }

    private void normalizeBaseUrl(AiApiConfig request) {
        String baseUrl = request.getBaseUrl();
        if (baseUrl == null) {
            return;
        }
        request.setBaseUrl(baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
    }

    private void normalizeApiType(AiApiConfig request) {
        String rawType = request.getApiType();
        if (rawType != null) {
            String normalized = rawType.trim().toLowerCase();
            if (AiApiConfig.TYPE_IMAGE.equals(normalized)) {
                request.setApiType(AiApiConfig.TYPE_IMAGE);
                return;
            }
            if (AiApiConfig.TYPE_TEXT.equals(normalized)) {
                request.setApiType(AiApiConfig.TYPE_TEXT);
                return;
            }
        }

        String modelName = request.getModelName();
        if (modelName != null) {
            String normalizedModelName = modelName.trim().toLowerCase();
            if (
                normalizedModelName.contains("image") ||
                normalizedModelName.startsWith("wan2.") ||
                normalizedModelName.startsWith("wan-")
            ) {
                request.setApiType(AiApiConfig.TYPE_IMAGE);
                return;
            }
        }

        request.setApiType(AiApiConfig.TYPE_TEXT);
    }

    private void normalizeModelName(AiApiConfig request) {
        if (request == null) {
            return;
        }
        String modelName = request.getModelName();
        if (modelName == null) {
            return;
        }
        String normalizedModelName = modelName.trim();
        if (normalizedModelName.equalsIgnoreCase("gpt-image-2")) {
            request.setModelName("gpt-image-2-all");
            return;
        }
        request.setModelName(normalizedModelName);
    }
}
