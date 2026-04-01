package com.multichat.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ChatRequest {

    @NotBlank(message = "sessionId cannot be blank")
    private String sessionId;

    @NotBlank(message = "prompt cannot be blank")
    private String prompt;
}
