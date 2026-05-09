package com.multichat.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class InviteCodeStore {

    private static final TypeReference<List<InviteAccount>> INVITE_LIST_TYPE = new TypeReference<>() { };

    private final ObjectMapper objectMapper;
    private final Path inviteFilePath;
    private final String bootstrapInviteCode;
    private final String bootstrapUserId;
    private final ConcurrentHashMap<String, InviteAccount> inviteByCode = new ConcurrentHashMap<>();

    private volatile long loadedFileMtime = -1L;

    public InviteCodeStore(
        ObjectMapper objectMapper,
        @Value("${multichat.auth.invite-file:${user.home}/.multi-chat/invite-codes.json}") String inviteFile,
        @Value("${multichat.auth.bootstrap-invite-code:admin-please-change}") String bootstrapInviteCode,
        @Value("${multichat.auth.bootstrap-user-id:admin}") String bootstrapUserId
    ) {
        this.objectMapper = objectMapper;
        this.inviteFilePath = Path.of(inviteFile).toAbsolutePath().normalize();
        this.bootstrapInviteCode = bootstrapInviteCode == null ? "admin-please-change" : bootstrapInviteCode.trim();
        this.bootstrapUserId = bootstrapUserId == null ? "admin" : bootstrapUserId.trim();
    }

    @PostConstruct
    void init() {
        loadFromDisk(true);
    }

    public Optional<InviteAccount> findEnabledByCode(String rawInviteCode) {
        loadFromDisk(false);
        String normalizedCode = normalizeInviteCode(rawInviteCode);
        if (normalizedCode == null) {
            return Optional.empty();
        }
        InviteAccount account = inviteByCode.get(normalizedCode);
        if (account == null || !Boolean.TRUE.equals(account.getEnabled())) {
            return Optional.empty();
        }
        return Optional.of(copyOf(account));
    }

    public Optional<InviteAccount> findEnabledByUserId(String rawUserId) {
        loadFromDisk(false);
        String normalizedUserId = normalizeUserId(rawUserId);
        if (normalizedUserId == null) {
            return Optional.empty();
        }
        return inviteByCode.values().stream()
            .filter(account -> Boolean.TRUE.equals(account.getEnabled()))
            .filter(account -> normalizedUserId.equals(account.getUserId()))
            .findFirst()
            .map(this::copyOf);
    }

    private synchronized void loadFromDisk(boolean forceReload) {
        ensureInviteFileExists();
        if (!Files.exists(inviteFilePath)) {
            inviteByCode.clear();
            loadedFileMtime = -1L;
            return;
        }

        try {
            long currentMtime = Files.getLastModifiedTime(inviteFilePath).toMillis();
            if (!forceReload && currentMtime == loadedFileMtime) {
                return;
            }

            List<InviteAccount> loaded = objectMapper.readValue(inviteFilePath.toFile(), INVITE_LIST_TYPE);
            inviteByCode.clear();
            if (loaded != null) {
                for (InviteAccount raw : loaded) {
                    InviteAccount normalized = normalizeInviteAccount(raw);
                    if (normalized == null) {
                        continue;
                    }
                    inviteByCode.put(normalized.getCode(), normalized);
                }
            }
            loadedFileMtime = currentMtime;
            log.info("Loaded {} invite code records from {}.", inviteByCode.size(), inviteFilePath);
        } catch (IOException ex) {
            log.warn("Failed to load invite codes from {}.", inviteFilePath, ex);
        }
    }

    private InviteAccount normalizeInviteAccount(InviteAccount raw) {
        if (raw == null) {
            return null;
        }

        String code = normalizeInviteCode(raw.getCode());
        String userId = normalizeUserId(raw.getUserId());
        if (code == null || userId == null) {
            return null;
        }

        String displayName = raw.getDisplayName() == null ? "" : raw.getDisplayName().trim();
        if (displayName.isBlank()) {
            displayName = userId;
        }

        return InviteAccount.builder()
            .code(code)
            .userId(userId)
            .displayName(displayName)
            .enabled(raw.getEnabled() == null ? Boolean.TRUE : raw.getEnabled())
            .build();
    }

    private InviteAccount copyOf(InviteAccount source) {
        return InviteAccount.builder()
            .code(source.getCode())
            .userId(source.getUserId())
            .displayName(source.getDisplayName())
            .enabled(source.getEnabled())
            .build();
    }

    private String normalizeInviteCode(String rawCode) {
        if (rawCode == null) {
            return null;
        }
        String normalized = rawCode.trim().toLowerCase();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized;
    }

    private String normalizeUserId(String rawUserId) {
        if (rawUserId == null) {
            return null;
        }
        String normalized = rawUserId.trim();
        if (normalized.isBlank()) {
            return null;
        }
        return normalized;
    }

    private void ensureInviteFileExists() {
        if (Files.exists(inviteFilePath)) {
            return;
        }

        Path parent = inviteFilePath.getParent();
        try {
            if (parent != null) {
                Files.createDirectories(parent);
            }

            InviteAccount bootstrapAccount = InviteAccount.builder()
                .code(normalizeInviteCode(bootstrapInviteCode))
                .userId(normalizeUserId(bootstrapUserId))
                .displayName("管理员")
                .enabled(Boolean.TRUE)
                .build();

            if (bootstrapAccount.getCode() == null || bootstrapAccount.getUserId() == null) {
                throw new IOException("Bootstrap invite code or user id is blank");
            }

            Path tempFile = parent == null
                ? Files.createTempFile("invite-codes-", ".tmp")
                : Files.createTempFile(parent, "invite-codes-", ".tmp");

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), List.of(bootstrapAccount));
            moveIntoPlace(tempFile, inviteFilePath);
            log.warn(
                "Invite code file not found. Created bootstrap file at {} with invite code '{}'. Please change it ASAP.",
                inviteFilePath,
                bootstrapAccount.getCode()
            );
        } catch (IOException ex) {
            log.warn("Failed to initialize invite code file at {}.", inviteFilePath, ex);
        }
    }

    private void moveIntoPlace(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
