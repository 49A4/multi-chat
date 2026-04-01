package com.multichat.model;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    @NotBlank(message = "role cannot be blank")
    private String role;

    @NotBlank(message = "content cannot be blank")
    private String content;
}
