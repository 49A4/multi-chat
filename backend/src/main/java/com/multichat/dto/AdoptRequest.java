package com.multichat.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AdoptRequest {

    @NotBlank(message = "content cannot be blank")
    private String content;
}
