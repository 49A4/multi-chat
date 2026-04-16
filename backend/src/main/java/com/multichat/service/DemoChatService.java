package com.multichat.service;

import com.multichat.model.SseEvent;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
public class DemoChatService {

    public Flux<SseEvent> streamDemo(String clientId, String sessionId, String prompt) {
        String eventSessionId = normalizeSessionId(sessionId);

        Map<String, String> responses = buildMockResponses(prompt);

        List<Flux<SseEvent>> streams = responses.entrySet().stream()
            .map(entry -> mockModelStream(eventSessionId, entry.getKey(), entry.getValue()))
            .toList();

        return Flux.merge(streams);
    }

    private Flux<SseEvent> mockModelStream(String sessionId, String model, String text) {
        String[] chunks = splitByLength(text, 2);
        return Flux.fromArray(chunks)
            .delayElements(Duration.ofMillis(40))
            .map(delta -> SseEvent.delta(sessionId, model, delta))
            .concatWith(Mono.just(SseEvent.done(sessionId, model, text)));
    }

    private Map<String, String> buildMockResponses(String prompt) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("Demo-GPT", "这是 Demo-GPT 的并发流式回复。你问的是：" + prompt + "。这个版本用于演示 SSE 分段输出。");
        map.put("Demo-Reasoner", "这是 Demo-Reasoner 的并发流式回复。核心思路是前端按 model 分桶拼接增量文本，最终得到完整答案。");
        return map;
    }

    private String[] splitByLength(String text, int chunkSize) {
        if (text == null || text.isEmpty()) {
            return new String[] { "" };
        }
        int size = Math.max(1, chunkSize);
        int total = (int) Math.ceil((double) text.length() / size);
        String[] result = new String[total];
        for (int i = 0; i < total; i++) {
            int start = i * size;
            int end = Math.min(start + size, text.length());
            result[i] = text.substring(start, end);
        }
        return result;
    }

    private String normalizeSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return "stateless-" + UUID.randomUUID();
        }
        return sessionId.trim();
    }
}
