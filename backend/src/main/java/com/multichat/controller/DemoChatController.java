package com.multichat.controller;

import com.multichat.dto.ChatRequest;
import com.multichat.model.SseEvent;
import com.multichat.service.DemoChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api/demo")
@RequiredArgsConstructor
public class DemoChatController {

    private final DemoChatService demoChatService;

    @PostMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<SseEvent>> stream(@Valid @RequestBody ChatRequest request) {
        return demoChatService.streamDemo(request.getSessionId(), request.getPrompt())
            .map(event -> ServerSentEvent.<SseEvent>builder()
                .event("message")
                .data(event)
                .build());
    }
}
