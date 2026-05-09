package com.multichat.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AuthSessionResponse {

    private String userId;
    private String displayName;
    private String accessToken;
    private Long expiresAt;
}

