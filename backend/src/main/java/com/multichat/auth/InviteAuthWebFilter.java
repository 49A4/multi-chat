package com.multichat.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.dto.ErrorResponse;
import com.multichat.util.ClientIdResolver;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@RequiredArgsConstructor
@Slf4j
public class InviteAuthWebFilter implements WebFilter {

    private final AuthTokenService authTokenService;
    private final ObjectMapper objectMapper;

    @Value("${multichat.auth.invite-required:true}")
    private boolean inviteRequired;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        if (!inviteRequired) {
            return chain.filter(exchange);
        }

        String path = exchange.getRequest().getPath().value();
        if (!path.startsWith("/api/")) {
            return chain.filter(exchange);
        }
        if (HttpMethod.OPTIONS.equals(exchange.getRequest().getMethod())) {
            return chain.filter(exchange);
        }
        if (isPublicPath(path)) {
            return chain.filter(exchange);
        }

        String token = resolveAccessToken(exchange.getRequest().getHeaders());
        if (token == null) {
            return unauthorized(exchange, "邀请码验证未通过，请先输入邀请码登录");
        }

        AuthTokenService.VerifiedToken verified = authTokenService.verifyToken(token);
        if (verified == null) {
            return unauthorized(exchange, "登录已过期或无效，请重新输入邀请码");
        }

        String userId = verified.userId();
        ServerWebExchange mutated = exchange.mutate()
            .request(exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(ClientIdResolver.USER_HEADER_NAME);
                    headers.set(ClientIdResolver.USER_HEADER_NAME, userId);
                })
                .build())
            .build();
        mutated.getAttributes().put(AuthConstants.USER_ID_ATTRIBUTE, userId);
        return chain.filter(mutated);
    }

    private boolean isPublicPath(String path) {
        return "/api/auth/login".equals(path) || path.startsWith("/api/auth/login/");
    }

    private String resolveAccessToken(HttpHeaders headers) {
        String rawHeader = headers.getFirst(AuthConstants.ACCESS_TOKEN_HEADER_NAME);
        if (rawHeader != null && !rawHeader.isBlank()) {
            return rawHeader.trim();
        }

        String authorization = headers.getFirst(HttpHeaders.AUTHORIZATION);
        if (authorization == null) {
            return null;
        }
        String value = authorization.trim();
        if (value.regionMatches(true, 0, "Bearer ", 0, 7) && value.length() > 7) {
            return value.substring(7).trim();
        }
        return null;
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        ErrorResponse body = ErrorResponse.builder()
            .status(HttpStatus.UNAUTHORIZED.value())
            .message(message)
            .timestamp(System.currentTimeMillis())
            .build();
        try {
            byte[] data = objectMapper.writeValueAsBytes(body);
            return exchange.getResponse().writeWith(
                Mono.just(exchange.getResponse().bufferFactory().wrap(data))
            );
        } catch (Exception ex) {
            log.warn("Failed to serialize unauthorized response", ex);
            byte[] data = ("{\"status\":401,\"message\":\"" + escapeJson(message) + "\",\"timestamp\":" + System.currentTimeMillis() + "}")
                .getBytes(StandardCharsets.UTF_8);
            return exchange.getResponse().writeWith(
                Mono.just(exchange.getResponse().bufferFactory().wrap(data))
            );
        }
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
