package com.multichat.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SseEvent {

    private String sessionId;
    private String model;
    private String delta;
    private boolean done;
    private String error;
    private String fullContent;

    public static SseEvent delta(String sessionId, String model, String delta) {
        return SseEvent.builder()
            .sessionId(sessionId)
            .model(model)
            .delta(delta)
            .done(false)
            .build();
    }

    public static SseEvent done(String sessionId, String model, String fullContent) {
        return SseEvent.builder()
            .sessionId(sessionId)
            .model(model)
            .delta("")
            .done(true)
            .fullContent(fullContent)
            .build();
    }

    public static SseEvent error(String sessionId, String model, String error, String partialContent) {
        return SseEvent.builder()
            .sessionId(sessionId)
            .model(model)
            .delta("")
            .done(true)
            .error(error)
            .fullContent(partialContent)
            .build();
    }
}
