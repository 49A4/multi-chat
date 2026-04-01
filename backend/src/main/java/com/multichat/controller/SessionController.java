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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions")
@RequiredArgsConstructor
public class SessionController {

    private final SessionStore sessionStore;

    @GetMapping
    public List<SessionSummary> findAll() {
        return sessionStore.findAll().stream()
            .map(session -> SessionSummary.builder()
                .id(session.getId())
                .title(session.getTitle())
                .createdAt(session.getCreatedAt())
                .messageCount(session.getMessages().size())
                .build())
            .toList();
    }

    @PostMapping
    public ChatSession create(@RequestBody(required = false) Map<String, String> request) {
        String title = request == null ? null : request.get("title");
        if (title != null && title.isBlank()) {
            title = null;
        }
        return sessionStore.create(title);
    }

    @GetMapping("/{id}")
    public ChatSession findById(@PathVariable String id) {
        return sessionStore.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable String id) {
        boolean removed = sessionStore.deleteById(id);
        if (!removed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id);
        }
    }

    @PostMapping("/{id}/adopt")
    public ChatSession adopt(@PathVariable String id, @Valid @RequestBody AdoptRequest request) {
        ChatSession session = sessionStore.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));

        sessionStore.appendMessage(session.getId(), ChatMessage.builder()
            .role("assistant")
            .content(request.getContent())
            .build());

        return sessionStore.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + id));
    }
}
