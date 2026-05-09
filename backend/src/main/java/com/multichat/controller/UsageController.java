package com.multichat.controller;

import com.multichat.exception.ApiException;
import com.multichat.model.UsageEvent;
import com.multichat.model.UserUsageSummary;
import com.multichat.store.UsageStore;
import com.multichat.util.ClientIdResolver;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/usage")
@RequiredArgsConstructor
public class UsageController {

    private final UsageStore usageStore;
    @Value("${multichat.auth.admin-user-ids:admin}")
    private String adminUserIdsCsv;

    @GetMapping("/me")
    public UserUsageSummary me(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return usageStore.findSummaryByUser(userId);
    }

    @GetMapping("/me/events")
    public List<UsageEvent> myRecentEvents(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @RequestParam(value = "limit", required = false) Integer limit
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        return usageStore.findRecentEventsByUser(userId, limit);
    }

    @GetMapping("/users")
    public List<UserUsageSummary> users(
        @RequestHeader(value = ClientIdResolver.HEADER_NAME, required = false) String clientIdHeader,
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader,
        @RequestParam(value = "limit", required = false) Integer limit
    ) {
        String userId = ClientIdResolver.resolve(clientIdHeader, userIdHeader);
        if (!isAdminUser(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Only admin users can access /api/usage/users");
        }
        return usageStore.findTopUsers(limit);
    }

    private boolean isAdminUser(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        Set<String> adminUsers = java.util.Arrays.stream(String.valueOf(adminUserIdsCsv).split(","))
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .collect(Collectors.toSet());
        if (adminUsers.isEmpty()) {
            adminUsers = Set.of("admin");
        }
        return adminUsers.contains(userId);
    }
}
