package com.multichat.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UsageEvent {

    private String id;
    private String requestId;
    private String userId;
    private String sessionId;
    private String model;
    private String mode;
    private boolean success;
    private String error;
    private Integer promptTokens;
    private Integer completionTokens;
    private Integer totalTokens;
    private Long createdAt;
}
