package com.multichat.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AuthLoginRequest {

    @NotBlank(message = "inviteCode cannot be blank")
    private String inviteCode;
}

