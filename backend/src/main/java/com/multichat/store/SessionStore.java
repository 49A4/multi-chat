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

    public ChatSession create(String ownerId, String title) {
        ChatSession session = ChatSession.builder()
            .ownerId(ownerId)
            .title(title)
            .build();
        store.put(session.getId(), session);
        return session;
    }

    public Optional<ChatSession> findByIdAndOwner(String id, String ownerId) {
        ChatSession session = store.get(id);
        if (!isOwner(session, ownerId)) {
            return Optional.empty();
        }
        return Optional.of(session);
    }

    public List<ChatSession> findAllByOwner(String ownerId) {
        return store.values().stream()
            .filter(session -> isOwner(session, ownerId))
            .sorted(Comparator.comparingLong(ChatSession::getCreatedAt).reversed())
            .toList();
    }

    public boolean deleteByIdAndOwner(String id, String ownerId) {
        ChatSession session = store.get(id);
        if (!isOwner(session, ownerId)) {
            return false;
        }
        return store.remove(id, session);
    }

    public ChatSession appendMessage(String id, String ownerId, ChatMessage message) {
        ChatSession existing = store.get(id);
        if (!isOwner(existing, ownerId)) {
            return null;
        }
        return store.computeIfPresent(id, (k, session) -> {
            if (!isOwner(session, ownerId)) {
                return session;
            }
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

    private boolean isOwner(ChatSession session, String ownerId) {
        if (session == null || ownerId == null) {
            return false;
        }
        String sessionOwner = session.getOwnerId();
        if (sessionOwner == null || sessionOwner.isBlank()) {
            return false;
        }
        return sessionOwner.equals(ownerId);
    }

    private String buildTitleFromContent(String content) {
        if (content == null || content.isBlank()) {
            return "New Chat";
        }
        String normalized = content.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 20 ? normalized : normalized.substring(0, 20);
    }
}
