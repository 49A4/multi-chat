package com.multichat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import lombok.Data;

@Data
public class ChatRequest {

    private String sessionId;

    @NotBlank(message = "prompt cannot be blank")
    private String prompt;

    private List<String> targetModels;

    private Boolean appendUserMessage;

    private String mode;

    @Min(value = 1, message = "imageCount must be >= 1")
    @Max(value = 8, message = "imageCount must be <= 8")
    private Integer imageCount;

    private String imageAspectRatio;

    private String imageQuality;

    private ImageInput imageInput;

    private List<ImageInput> imageInputs;
}
