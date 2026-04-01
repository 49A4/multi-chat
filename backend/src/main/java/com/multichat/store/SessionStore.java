package com.multichat.store;

import com.multichat.model.ChatMessage;
import com.multichat.model.ChatSession;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class SessionStore {

    private static final int MAX_MESSAGES_PER_SESSION = 100;
    private final ConcurrentHashMap<String, ChatSession> store = new ConcurrentHashMap<>();

    public ChatSession create(String title) {
        ChatSession session = ChatSession.builder().title(title).build();
        store.put(session.getId(), session);
        return session;
    }

    public Optional<ChatSession> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public List<ChatSession> findAll() {
        return store.values().stream()
            .sorted(Comparator.comparingLong(ChatSession::getCreatedAt).reversed())
            .toList();
    }

    public boolean deleteById(String id) {
        return store.remove(id) != null;
    }

    public ChatSession appendMessage(String id, ChatMessage message) {
        return store.computeIfPresent(id, (k, session) -> {
            List<ChatMessage> messages = new ArrayList<>(session.getMessages());
            messages.add(message);
            if (messages.size() > MAX_MESSAGES_PER_SESSION) {
                messages = new ArrayList<>(messages.subList(messages.size() - MAX_MESSAGES_PER_SESSION, messages.size()));
            }
            session.setMessages(messages);
            if (session.getTitle() == null || session.getTitle().isBlank()) {
                session.setTitle(buildTitleFromContent(message.getContent()));
            }
            return session;
        });
    }

    public ChatSession replace(String id, ChatSession session) {
        store.put(id, session);
        return session;
    }

    private String buildTitleFromContent(String content) {
        if (content == null || content.isBlank()) {
            return "New Chat";
        }
        String normalized = content.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 20 ? normalized : normalized.substring(0, 20);
    }
}
