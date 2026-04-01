package com.multichat.service;

import com.multichat.exception.ApiException;
import com.multichat.model.AiApiConfig;
import com.multichat.model.ChatMessage;
import com.multichat.model.ChatSession;
import com.multichat.model.SseEvent;
import com.multichat.store.ApiConfigStore;
import com.multichat.store.SessionStore;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final SessionStore sessionStore;
    private final ApiConfigStore apiConfigStore;
    private final OpenAiCompatClient openAiCompatClient;

    public Flux<SseEvent> streamChat(String sessionId, String prompt) {
        ChatSession existingSession = sessionStore.findById(sessionId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Session not found: " + sessionId));

        sessionStore.appendMessage(existingSession.getId(), ChatMessage.builder()
            .role("user")
            .content(prompt)
            .build());

        List<ChatMessage> context = sessionStore.findById(sessionId)
            .map(ChatSession::getMessages)
            .map(List::copyOf)
            .orElse(List.of());

        List<AiApiConfig> enabledConfigs = apiConfigStore.findAllEnabled();
        if (enabledConfigs.isEmpty()) {
            return Flux.just(SseEvent.error(sessionId, "system", "No enabled API config found", ""));
        }

        List<Flux<SseEvent>> streams = enabledConfigs.stream()
            .map(config -> buildModelEventStream(sessionId, config, context))
            .toList();

        return Flux.merge(streams);
    }

    private Flux<SseEvent> buildModelEventStream(String sessionId, AiApiConfig config, List<ChatMessage> context) {
        String modelTag = buildModelTag(config);
        StringBuilder fullText = new StringBuilder();

        return openAiCompatClient.streamCompletion(config, context)
            .map(delta -> {
                fullText.append(delta);
                return SseEvent.delta(sessionId, modelTag, delta);
            })
            .concatWith(Mono.fromSupplier(() -> {
                if (fullText.isEmpty()) {
                    return SseEvent.error(
                        sessionId,
                        modelTag,
                        "模型已结束但未返回文本，请检查 model 名称、权限或供应商响应格式",
                        ""
                    );
                }
                return SseEvent.done(sessionId, modelTag, fullText.toString());
            }))
            .onErrorResume(ex -> Mono.just(SseEvent.error(sessionId, modelTag, ex.getMessage(), fullText.toString())));
    }

    private String buildModelTag(AiApiConfig config) {
        if (config.getName() != null && !config.getName().isBlank()) {
            return config.getName();
        }
        return config.getModelName();
    }
}
