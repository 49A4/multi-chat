package com.multichat.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiApiConfig {

    @Builder.Default
    private String id = UUID.randomUUID().toString();

    @NotBlank(message = "name cannot be blank")
    private String name;

    @NotBlank(message = "baseUrl cannot be blank")
    private String baseUrl;

    @NotBlank(message = "apiKey cannot be blank")
    private String apiKey;

    @NotBlank(message = "modelName cannot be blank")
    private String modelName;

    @NotNull
    @Builder.Default
    private Boolean enabled = Boolean.TRUE;

    @Min(value = 1, message = "maxTokens must be >= 1")
    @Max(value = 16384, message = "maxTokens must be <= 16384")
    @Builder.Default
    private Integer maxTokens = 2048;

    @Min(value = 0, message = "temperature must be >= 0")
    @Max(value = 2, message = "temperature must be <= 2")
    @Builder.Default
    private Double temperature = 0.7;
}
