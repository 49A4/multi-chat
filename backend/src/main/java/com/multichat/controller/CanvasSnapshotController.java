package com.multichat.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.dto.CanvasSnapshotDetail;
import com.multichat.dto.CanvasSnapshotSaveRequest;
import com.multichat.dto.CanvasSnapshotSummary;
import com.multichat.exception.ApiException;
import com.multichat.model.CanvasSnapshotRecord;
import com.multichat.store.CanvasSnapshotStore;
import com.multichat.util.ClientIdResolver;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/canvas-snapshots")
@RequiredArgsConstructor
public class CanvasSnapshotController {

    private static final String DEFAULT_TITLE = "未命名画布";
    private static final int TITLE_MAX_LENGTH = 80;

    private final CanvasSnapshotStore canvasSnapshotStore;
    private final ObjectMapper objectMapper;

    @GetMapping
    public List<CanvasSnapshotSummary> findAll(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return canvasSnapshotStore.findAllByOwner(ownerId).stream()
            .map(this::toSummary)
            .toList();
    }

    @GetMapping("/{id}")
    public CanvasSnapshotDetail findById(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        CanvasSnapshotRecord record = canvasSnapshotStore.findByIdAndOwner(id, ownerId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Canvas snapshot not found: " + id));
        return toDetail(record);
    }

    @PostMapping
    public CanvasSnapshotDetail save(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @RequestBody CanvasSnapshotSaveRequest request
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        JsonNode snapshot = request == null ? null : request.getSnapshot();
        if (snapshot == null || snapshot.isNull()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "snapshot is required");
        }

        String normalizedId = request == null ? null : request.getId();
        String resolvedTitle = resolveTitle(request == null ? null : request.getTitle(), snapshot);
        String snapshotJson;
        try {
            snapshotJson = objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "snapshot is not valid JSON");
        }

        CanvasSnapshotRecord saved = canvasSnapshotStore.save(ownerId, normalizedId, resolvedTitle, snapshotJson);
        return toDetail(saved);
    }

    @DeleteMapping("/{id}")
    public void delete(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String ownerId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        boolean removed = canvasSnapshotStore.deleteByIdAndOwner(id, ownerId);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Canvas snapshot not found: " + id);
        }
    }

    private CanvasSnapshotSummary toSummary(CanvasSnapshotRecord record) {
        return CanvasSnapshotSummary.builder()
            .id(record.getId())
            .title(record.getTitle())
            .createdAt(record.getCreatedAt())
            .updatedAt(record.getUpdatedAt())
            .build();
    }

    private CanvasSnapshotDetail toDetail(CanvasSnapshotRecord record) {
        JsonNode parsedSnapshot;
        try {
            parsedSnapshot = objectMapper.readTree(record.getSnapshotJson());
        } catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Stored canvas snapshot is corrupted");
        }
        return CanvasSnapshotDetail.builder()
            .id(record.getId())
            .title(record.getTitle())
            .createdAt(record.getCreatedAt())
            .updatedAt(record.getUpdatedAt())
            .snapshot(parsedSnapshot)
            .build();
    }

    private String resolveTitle(String rawTitle, JsonNode snapshot) {
        String title = sanitizeTitle(rawTitle);
        if (title != null) {
            return title;
        }

        JsonNode questionNodes = snapshot.path("questionNodes");
        if (questionNodes.isArray() && !questionNodes.isEmpty()) {
            String firstQuestion = sanitizeTitle(questionNodes.get(0).path("text").asText(null));
            if (firstQuestion != null) {
                return firstQuestion;
            }
        }

        String promptTitle = sanitizeTitle(snapshot.path("prompt").asText(null));
        if (promptTitle != null) {
            return promptTitle;
        }
        return DEFAULT_TITLE;
    }

    private String sanitizeTitle(String rawTitle) {
        if (rawTitle == null) {
            return null;
        }
        String normalized = rawTitle.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.length() <= TITLE_MAX_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, TITLE_MAX_LENGTH);
    }
}
