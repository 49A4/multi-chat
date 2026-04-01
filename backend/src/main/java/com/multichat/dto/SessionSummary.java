package com.multichat.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class SessionSummary {

    private String id;
    private String title;
    private Long createdAt;
    private Integer messageCount;
}
