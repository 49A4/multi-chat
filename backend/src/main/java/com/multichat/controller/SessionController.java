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
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader
    ) {
        String clientId = ClientIdResolver.resolve(clientIdHeader);
        return sessionStore.findAllByOwner(clientId).stream()
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
        @RequestBody(required = false) Map<String, String> request
    ) {
        String clientId = ClientIdResolver.resolve(clientIdHeader);
        String title = request == null ? null : request.get("title");
        if (title != null && title.isBlank()) {
            title = null;
        }
        return sessionStore.create(clientId, title);
    }

    @GetMapping("/{id}")
    public ChatSession findById(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @PathVariable String id
    ) {
        String clientId = ClientIdResolver.resolve(clientIdHeader);
        return sessionStore.findByIdAndOwner(id, clientId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }

    @DeleteMapping("/{id}")
    public void delete(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @PathVariable String id
    ) {
        String clientId = ClientIdResolver.resolve(clientIdHeader);
        boolean removed = sessionStore.deleteByIdAndOwner(id, clientId);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id);
        }
    }

    @PostMapping("/{id}/adopt")
    public ChatSession adopt(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @PathVariable String id,
        @Valid @RequestBody AdoptRequest request
    ) {
        String clientId = ClientIdResolver.resolve(clientIdHeader);
        ChatSession session = sessionStore.findByIdAndOwner(id, clientId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));

        sessionStore.appendMessage(session.getId(), clientId, ChatMessage.builder()
            .role("assistant")
            .content(request.getContent())
            .build());

        return sessionStore.findByIdAndOwner(id, clientId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }
}
