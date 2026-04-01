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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/configs")
@RequiredArgsConstructor
public class ApiConfigController {

    private final ApiConfigStore apiConfigStore;

    @GetMapping
    public List<AiApiConfig> findAll() {
        return apiConfigStore.findAll();
    }

    @PostMapping
    public AiApiConfig create(@Valid @RequestBody AiApiConfig request) {
        if (request.getId() == null || request.getId().isBlank()) {
            request.setId(UUID.randomUUID().toString());
        }
        normalizeBaseUrl(request);
        return apiConfigStore.save(request);
    }

    @PutMapping("/{id}")
    public AiApiConfig update(@PathVariable String id, @Valid @RequestBody AiApiConfig request) {
        AiApiConfig existing = apiConfigStore.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + id));

        request.setId(existing.getId());
        normalizeBaseUrl(request);
        return apiConfigStore.save(request);
    }

    @PatchMapping("/{id}/toggle")
    public AiApiConfig toggle(@PathVariable String id) {
        AiApiConfig config = apiConfigStore.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + id));

        config.setEnabled(!Boolean.TRUE.equals(config.getEnabled()));
        return apiConfigStore.save(config);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        boolean removed = apiConfigStore.deleteById(id);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Config not found: " + id);
        }
    }

    private void normalizeBaseUrl(AiApiConfig request) {
        String baseUrl = request.getBaseUrl();
        if (baseUrl == null) {
            return;
        }
        request.setBaseUrl(baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
    }
}
