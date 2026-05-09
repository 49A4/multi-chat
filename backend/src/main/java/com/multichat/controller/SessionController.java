package com.multichat.controller;

import com.multichat.dto.AdoptRequest;
import com.multichat.dto.SessionSummary;
import com.multichat.exception.ApiException;
import com.multichat.model.ChatMessage;
import com.multichat.model.ChatSession;
import com.multichat.store.SessionStore;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
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
import com.multichat.util.ClientIdResolver;

@RestController
@RequestMapping("/api/sessions")
@RequiredArgsConstructor
public class SessionController {

    private final SessionStore sessionStore;

    @GetMapping
    public List<SessionSummary> findAll(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return sessionStore.findAllByOwner(userId).stream()
            .map(session -> SessionSummary.builder()
                .id(session.getId())
                .title(session.getTitle())
                .createdAt(session.getCreatedAt())
                .messageCount(session.getMessages().size())
                .build())
            .toList();
    }

    @PostMapping
    public ChatSession create(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @RequestBody(required = false) Map<String, String> request
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        String title = request == null ? null : request.get("title");
        if (title != null && title.isBlank()) {
            title = null;
        }
        return sessionStore.create(userId, title);
    }

    @GetMapping("/{id}")
    public ChatSession findById(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return sessionStore.findByIdAndOwner(id, userId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }

    @DeleteMapping("/{id}")
    public void delete(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        boolean removed = sessionStore.deleteByIdAndOwner(id, userId);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id);
        }
    }

    @PostMapping("/{id}/adopt")
    public ChatSession adopt(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @PathVariable String id,
        @Valid @RequestBody AdoptRequest request
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        ChatSession session = sessionStore.findByIdAndOwner(id, userId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));

        sessionStore.appendMessage(session.getId(), userId, ChatMessage.builder()
            .role("assistant")
            .content(request.getContent())
            .build());

        return sessionStore.findByIdAndOwner(id, userId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }
}
