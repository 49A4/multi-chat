package com.multichat.controller;

import com.multichat.auth.AuthTokenService;
import com.multichat.auth.InviteAccount;
import com.multichat.auth.InviteCodeStore;
import com.multichat.dto.AuthLoginRequest;
import com.multichat.dto.AuthSessionResponse;
import com.multichat.exception.ApiException;
import com.multichat.util.ClientIdResolver;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final InviteCodeStore inviteCodeStore;
    private final AuthTokenService authTokenService;

    @PostMapping("/login")
    public AuthSessionResponse login(@Valid @RequestBody AuthLoginRequest request) {
        InviteAccount account = inviteCodeStore.findEnabledByCode(request.getInviteCode())
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "邀请码无效或已停用"));

        AuthTokenService.IssuedToken issued = authTokenService.issueToken(account.getUserId());
        return AuthSessionResponse.builder()
            .userId(account.getUserId())
            .displayName(account.getDisplayName())
            .accessToken(issued.token())
            .expiresAt(issued.expiresAt())
            .build();
    }

    @GetMapping("/me")
    public AuthSessionResponse me(
        @RequestHeader(value = ClientIdResolver.USER_HEADER_NAME, required = false) String userIdHeader
    ) {
        String userId = ClientIdResolver.resolve(null, userIdHeader);
        if (userId == null || userId.isBlank() || "web-anonymous".equals(userId)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "未登录");
        }
        String displayName = inviteCodeStore.findEnabledByUserId(userId)
            .map(InviteAccount::getDisplayName)
            .orElse(userId);
        return AuthSessionResponse.builder()
            .userId(userId)
            .displayName(displayName)
            .accessToken(null)
            .expiresAt(null)
            .build();
    }
}

