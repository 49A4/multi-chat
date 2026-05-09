package com.multichat.exception;

import com.multichat.dto.ErrorResponse;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.core.codec.DecodingException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(ErrorResponse.builder()
            .status(ex.getStatus().value())
            .message(ex.getMessage())
            .timestamp(System.currentTimeMillis())
            .build());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class, ConstraintViolationException.class})
    public ResponseEntity<ErrorResponse> handleValidationException(Exception ex) {
        String message;
        if (ex instanceof MethodArgumentNotValidException manve) {
            message = manve.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        } else if (ex instanceof BindException be) {
            message = be.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        } else {
            message = ex.getMessage();
        }

        return ResponseEntity.badRequest().body(ErrorResponse.builder()
            .status(HttpStatus.BAD_REQUEST.value())
            .message(message)
            .timestamp(System.currentTimeMillis())
            .build());
    }

    @ExceptionHandler(DataBufferLimitException.class)
    public ResponseEntity<ErrorResponse> handlePayloadTooLarge(DataBufferLimitException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(ErrorResponse.builder()
            .status(HttpStatus.PAYLOAD_TOO_LARGE.value())
            .message("请求内容过大，请压缩图片后重试（建议 6MB 以内）")
            .timestamp(System.currentTimeMillis())
            .build());
    }

    @ExceptionHandler(DecodingException.class)
    public ResponseEntity<ErrorResponse> handleDecodingException(DecodingException ex) {
        Throwable cause = ex.getCause();
        if (cause instanceof DataBufferLimitException) {
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(ErrorResponse.builder()
                .status(HttpStatus.PAYLOAD_TOO_LARGE.value())
                .message("请求内容过大，请压缩图片后重试（建议 6MB 以内）")
                .timestamp(System.currentTimeMillis())
                .build());
        }
        return ResponseEntity.badRequest().body(ErrorResponse.builder()
            .status(HttpStatus.BAD_REQUEST.value())
            .message("请求内容格式错误，请检查输入后重试")
            .timestamp(System.currentTimeMillis())
            .build());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnknownException(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ErrorResponse.builder()
            .status(HttpStatus.INTERNAL_SERVER_ERROR.value())
            .message(ex.getMessage() == null ? "Internal server error" : ex.getMessage())
            .timestamp(System.currentTimeMillis())
            .build());
    }
}
