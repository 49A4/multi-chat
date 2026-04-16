package com.multichat.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.Data;

@Data
public class ChatRequest {

    private String sessionId;

    @NotBlank(message = "prompt cannot be blank")
    private String prompt;

    private List<String> targetModels;

    private Boolean appendUserMessage;
}
