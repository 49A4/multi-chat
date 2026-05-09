package com.multichat.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserUsageSummary {

    private String userId;

    @Builder.Default
    private Long requestCount = 0L;

    @Builder.Default
    private Long modelCompletionCount = 0L;

    @Builder.Default
    private Long successCount = 0L;

    @Builder.Default
    private Long failureCount = 0L;

    @Builder.Default
    private Long promptTokens = 0L;

    @Builder.Default
    private Long completionTokens = 0L;

    @Builder.Default
    private Long totalTokens = 0L;

    @Builder.Default
    private Long updatedAt = System.currentTimeMillis();
}
