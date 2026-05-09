package com.multichat.store;

import com.multichat.model.SseEvent;
import com.multichat.model.UsageEvent;
import com.multichat.model.UserUsageSummary;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class UsageStore {

    private static final int DEFAULT_EVENT_LIMIT = 50;
    private static final int DEFAULT_USER_LIMIT = 50;
    private static final int MAX_QUERY_LIMIT = 500;

    private final ConcurrentHashMap<String, UserUsageSummary> summaryByUser = new ConcurrentHashMap<>();
    private final ConcurrentLinkedDeque<UsageEvent> events = new ConcurrentLinkedDeque<>();
    private final Set<String> finalizedModelRuns = ConcurrentHashMap.newKeySet();
    private final ConcurrentLinkedDeque<String> finalizedModelRunOrder = new ConcurrentLinkedDeque<>();
    private final int maxStoredEvents;
    private final int maxFinalizedRunKeys;

    public UsageStore(@Value("${multichat.usage.max-events:10000}") int rawMaxStoredEvents) {
        this.maxStoredEvents = normalizeMaxStoredEvents(rawMaxStoredEvents);
        this.maxFinalizedRunKeys = this.maxStoredEvents * 8;
    }

    public void recordRequestStart(String userId) {
        String normalizedUserId = normalizeUserId(userId);
        long now = System.currentTimeMillis();

        summaryByUser.compute(normalizedUserId, (id, existing) -> {
            UserUsageSummary summary = existing == null ? createEmptySummary(id) : existing;
            summary.setRequestCount(summary.getRequestCount() + 1);
            summary.setUpdatedAt(now);
            return summary;
        });
    }

    public void recordModelFinalEvent(String userId, String requestId, String mode, SseEvent event) {
        if (event == null || !event.isDone()) {
            return;
        }

        String normalizedUserId = normalizeUserId(userId);
        String normalizedRequestId = normalizeNonBlank(requestId, "unknown-request");
        String normalizedModel = normalizeNonBlank(event.getModel(), "unknown-model");
        String dedupeKey = normalizedUserId + "|" + normalizedRequestId + "|" + normalizedModel;
        if (!tryMarkFinalizedModelRun(dedupeKey)) {
            return;
        }

        long now = System.currentTimeMillis();
        Integer promptTokens = normalizeNonNegative(event.getPromptTokens());
        Integer completionTokens = normalizeNonNegative(event.getCompletionTokens());
        Integer totalTokens = normalizeNonNegative(event.getTotalTokens());
        if (totalTokens == null && promptTokens != null && completionTokens != null) {
            totalTokens = promptTokens + completionTokens;
        }

        boolean success = event.getError() == null || event.getError().isBlank();
        UsageEvent usageEvent = UsageEvent.builder()
            .id(UUID.randomUUID().toString())
            .requestId(normalizedRequestId)
            .userId(normalizedUserId)
            .sessionId(event.getSessionId())
            .model(normalizedModel)
            .mode(normalizeNonBlank(mode, "text"))
            .success(success)
            .error(success ? null : trimError(event.getError()))
            .promptTokens(promptTokens)
            .completionTokens(completionTokens)
            .totalTokens(totalTokens)
            .createdAt(now)
            .build();

        events.addLast(usageEvent);
        trimEventsIfNeeded();

        long promptDelta = promptTokens == null ? 0L : promptTokens;
        long completionDelta = completionTokens == null ? 0L : completionTokens;
        long totalDelta = totalTokens == null ? 0L : totalTokens;

        summaryByUser.compute(normalizedUserId, (id, existing) -> {
            UserUsageSummary summary = existing == null ? createEmptySummary(id) : existing;
            summary.setModelCompletionCount(summary.getModelCompletionCount() + 1);
            if (success) {
                summary.setSuccessCount(summary.getSuccessCount() + 1);
            } else {
                summary.setFailureCount(summary.getFailureCount() + 1);
            }
            summary.setPromptTokens(summary.getPromptTokens() + promptDelta);
            summary.setCompletionTokens(summary.getCompletionTokens() + completionDelta);
            summary.setTotalTokens(summary.getTotalTokens() + totalDelta);
            summary.setUpdatedAt(now);
            return summary;
        });
    }

    public UserUsageSummary findSummaryByUser(String userId) {
        String normalizedUserId = normalizeUserId(userId);
        UserUsageSummary summary = summaryByUser.get(normalizedUserId);
        if (summary == null) {
            return createEmptySummary(normalizedUserId);
        }
        return copySummary(summary);
    }

    public List<UsageEvent> findRecentEventsByUser(String userId, Integer rawLimit) {
        String normalizedUserId = normalizeUserId(userId);
        int limit = normalizeQueryLimit(rawLimit, DEFAULT_EVENT_LIMIT);
        List<UsageEvent> matched = new ArrayList<>(limit);
        Iterator<UsageEvent> iterator = events.descendingIterator();
        while (iterator.hasNext() && matched.size() < limit) {
            UsageEvent event = iterator.next();
            if (!normalizedUserId.equals(event.getUserId())) {
                continue;
            }
            matched.add(copyEvent(event));
        }
        return matched;
    }

    public List<UserUsageSummary> findTopUsers(Integer rawLimit) {
        int limit = normalizeQueryLimit(rawLimit, DEFAULT_USER_LIMIT);
        return summaryByUser.values().stream()
            .map(this::copySummary)
            .sorted(Comparator.comparingLong(UserUsageSummary::getTotalTokens).reversed()
                .thenComparing(Comparator.comparingLong(UserUsageSummary::getRequestCount).reversed())
                .thenComparing(Comparator.comparingLong(UserUsageSummary::getUpdatedAt).reversed()))
            .limit(limit)
            .toList();
    }

    private synchronized boolean tryMarkFinalizedModelRun(String dedupeKey) {
        if (!finalizedModelRuns.add(dedupeKey)) {
            return false;
        }
        finalizedModelRunOrder.addLast(dedupeKey);
        while (finalizedModelRunOrder.size() > maxFinalizedRunKeys) {
            String oldest = finalizedModelRunOrder.pollFirst();
            if (oldest == null) {
                break;
            }
            finalizedModelRuns.remove(oldest);
        }
        return true;
    }

    private synchronized void trimEventsIfNeeded() {
        while (events.size() > maxStoredEvents) {
            events.pollFirst();
        }
    }

    private UserUsageSummary createEmptySummary(String userId) {
        return UserUsageSummary.builder()
            .userId(userId)
            .requestCount(0L)
            .modelCompletionCount(0L)
            .successCount(0L)
            .failureCount(0L)
            .promptTokens(0L)
            .completionTokens(0L)
            .totalTokens(0L)
            .updatedAt(System.currentTimeMillis())
            .build();
    }

    private UserUsageSummary copySummary(UserUsageSummary source) {
        return UserUsageSummary.builder()
            .userId(source.getUserId())
            .requestCount(source.getRequestCount())
            .modelCompletionCount(source.getModelCompletionCount())
            .successCount(source.getSuccessCount())
            .failureCount(source.getFailureCount())
            .promptTokens(source.getPromptTokens())
            .completionTokens(source.getCompletionTokens())
            .totalTokens(source.getTotalTokens())
            .updatedAt(source.getUpdatedAt())
            .build();
    }

    private UsageEvent copyEvent(UsageEvent source) {
        return UsageEvent.builder()
            .id(source.getId())
            .requestId(source.getRequestId())
            .userId(source.getUserId())
            .sessionId(source.getSessionId())
            .model(source.getModel())
            .mode(source.getMode())
            .success(source.isSuccess())
            .error(source.getError())
            .promptTokens(source.getPromptTokens())
            .completionTokens(source.getCompletionTokens())
            .totalTokens(source.getTotalTokens())
            .createdAt(source.getCreatedAt())
            .build();
    }

    private Integer normalizeNonNegative(Integer value) {
        if (value == null || value < 0) {
            return null;
        }
        return value;
    }

    private int normalizeQueryLimit(Integer rawLimit, int fallback) {
        if (rawLimit == null) {
            return fallback;
        }
        return Math.max(1, Math.min(rawLimit, MAX_QUERY_LIMIT));
    }

    private int normalizeMaxStoredEvents(int rawMaxStoredEvents) {
        if (rawMaxStoredEvents <= 0) {
            return 10000;
        }
        return Math.max(500, Math.min(rawMaxStoredEvents, 200000));
    }

    private String normalizeUserId(String userId) {
        return normalizeNonBlank(userId, "web-anonymous");
    }

    private String normalizeNonBlank(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim();
        if (normalized.isBlank()) {
            return fallback;
        }
        return normalized;
    }

    private String trimError(String error) {
        if (error == null) {
            return null;
        }
        String normalized = error.trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.length() <= 400) {
            return normalized;
        }
        return normalized.substring(0, 400) + "...";
    }
}
