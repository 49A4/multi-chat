package com.multichat.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.multichat.model.AiApiConfig;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class ApiConfigStore {

    private static final String LEGACY_OWNER_ID = "__legacy__";
    private static final String FALLBACK_OWNER_ID = "web-anonymous";

    private final ConcurrentHashMap<String, ConcurrentHashMap<String, AiApiConfig>> storeByOwner = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final Path configFilePath;

    public ApiConfigStore(
        ObjectMapper objectMapper,
        @Value("${multichat.api-config-file:${user.home}/.multi-chat/api-configs.json}") String configFile
    ) {
        this.objectMapper = objectMapper;
        this.configFilePath = Path.of(configFile).toAbsolutePath().normalize();
    }

    @PostConstruct
    void init() {
        loadFromDisk();
    }

    public AiApiConfig save(String ownerId, AiApiConfig config) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        normalizeModelName(config);
        normalizeApiType(config);
        ownerStore(normalizedOwnerId).put(config.getId(), config);
        persistToDisk();
        return config;
    }

    public Optional<AiApiConfig> findById(String ownerId, String id) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        return Optional.ofNullable(ownerStore(normalizedOwnerId).get(id));
    }

    public List<AiApiConfig> findAll(String ownerId) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        return new ArrayList<>(ownerStore(normalizedOwnerId).values());
    }

    public List<AiApiConfig> findAllEnabled(String ownerId) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        return ownerStore(normalizedOwnerId).values().stream()
            .filter(cfg -> Objects.equals(Boolean.TRUE, cfg.getEnabled()))
            .toList();
    }

    public boolean deleteById(String ownerId, String id) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        boolean removed = ownerStore(normalizedOwnerId).remove(id) != null;
        if (removed) {
            persistToDisk();
        }
        return removed;
    }

    private ConcurrentHashMap<String, AiApiConfig> ownerStore(String ownerId) {
        String normalizedOwnerId = normalizeOwnerId(ownerId);
        ConcurrentHashMap<String, AiApiConfig> existing = storeByOwner.get(normalizedOwnerId);
        if (existing != null) {
            return existing;
        }

        ConcurrentHashMap<String, AiApiConfig> created = new ConcurrentHashMap<>();
        ConcurrentHashMap<String, AiApiConfig> raced = storeByOwner.putIfAbsent(normalizedOwnerId, created);
        ConcurrentHashMap<String, AiApiConfig> resolved = raced != null ? raced : created;
        if (raced == null) {
            seedFromLegacyIfNeeded(normalizedOwnerId, resolved);
        }
        return resolved;
    }

    private void seedFromLegacyIfNeeded(String ownerId, ConcurrentHashMap<String, AiApiConfig> targetStore) {
        if (LEGACY_OWNER_ID.equals(ownerId)) {
            return;
        }
        ConcurrentHashMap<String, AiApiConfig> legacyStore = storeByOwner.get(LEGACY_OWNER_ID);
        if (legacyStore == null || legacyStore.isEmpty()) {
            return;
        }
        legacyStore.forEach((id, config) -> targetStore.put(id, copyConfig(config)));
        persistToDisk();
    }

    private AiApiConfig copyConfig(AiApiConfig config) {
        return objectMapper.convertValue(config, AiApiConfig.class);
    }

    private String normalizeOwnerId(String rawOwnerId) {
        if (rawOwnerId == null) {
            return FALLBACK_OWNER_ID;
        }
        String normalized = rawOwnerId.trim();
        if (normalized.isBlank()) {
            return FALLBACK_OWNER_ID;
        }
        return normalized;
    }

    private void loadFromDisk() {
        if (!Files.exists(configFilePath)) {
            log.info("No API config file found at {}, starting with empty config list.", configFilePath);
            return;
        }

        try {
            JsonNode root = objectMapper.readTree(configFilePath.toFile());
            storeByOwner.clear();
            if (root == null || root.isNull()) {
                return;
            }

            if (root.isObject()) {
                root.fields().forEachRemaining(entry -> loadOwnerConfigArray(entry.getKey(), entry.getValue()));
                log.info("Loaded API config map for {} owners from {}.", storeByOwner.size(), configFilePath);
                return;
            }

            if (root.isArray()) {
                for (JsonNode node : root) {
                    if (node == null || node.isNull()) {
                        continue;
                    }
                    if (node.has("ownerId") && node.has("config")) {
                        String ownerId = normalizeOwnerId(node.path("ownerId").asText(null));
                        AiApiConfig config = objectMapper.treeToValue(node.path("config"), AiApiConfig.class);
                        if (config == null || config.getId() == null || config.getId().isBlank()) {
                            continue;
                        }
                        normalizeModelName(config);
                        normalizeApiType(config);
                        ownerStore(ownerId).put(config.getId(), config);
                        continue;
                    }

                    // Legacy format: a plain config list without owner.
                    AiApiConfig config = objectMapper.treeToValue(node, AiApiConfig.class);
                    if (config == null || config.getId() == null || config.getId().isBlank()) {
                        continue;
                    }
                    normalizeModelName(config);
                    normalizeApiType(config);
                    ownerStore(LEGACY_OWNER_ID).put(config.getId(), config);
                }
                log.info("Loaded API configs from {} (owner count: {}).", configFilePath, storeByOwner.size());
                return;
            }

            log.warn("Unsupported API config file structure at {}.", configFilePath);
        } catch (IOException ex) {
            log.warn("Failed to load API configs from {}, using empty config list.", configFilePath, ex);
        }
    }

    private void loadOwnerConfigArray(String rawOwnerId, JsonNode value) {
        if (value == null || !value.isArray()) {
            return;
        }
        String ownerId = normalizeOwnerId(rawOwnerId);
        for (JsonNode node : value) {
            if (node == null || node.isNull()) {
                continue;
            }
            try {
                AiApiConfig config = objectMapper.treeToValue(node, AiApiConfig.class);
                if (config == null || config.getId() == null || config.getId().isBlank()) {
                    continue;
                }
                normalizeModelName(config);
                normalizeApiType(config);
                ownerStore(ownerId).put(config.getId(), config);
            } catch (Exception ex) {
                log.warn("Skipped invalid API config for owner {}.", ownerId, ex);
            }
        }
    }

    private synchronized void persistToDisk() {
        Map<String, List<AiApiConfig>> snapshot = new TreeMap<>();
        storeByOwner.forEach((ownerId, ownerStore) -> {
            if (ownerStore == null || ownerStore.isEmpty()) {
                return;
            }
            snapshot.put(ownerId, new ArrayList<>(ownerStore.values()));
        });

        Path parent = configFilePath.getParent();
        try {
            if (parent != null) {
                Files.createDirectories(parent);
            }

            Path tempFile = parent == null
                ? Files.createTempFile("api-configs-", ".tmp")
                : Files.createTempFile(parent, "api-configs-", ".tmp");

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), snapshot);
            moveIntoPlace(tempFile, configFilePath);
        } catch (IOException ex) {
            log.warn("Failed to persist API configs to {}.", configFilePath, ex);
        }
    }

    private void moveIntoPlace(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void normalizeApiType(AiApiConfig config) {
        if (config == null) {
            return;
        }

        String modelName = config.getModelName() == null ? "" : config.getModelName().trim().toLowerCase();
        boolean isImageModel =
            modelName.contains("image") ||
            modelName.startsWith("wan2.") ||
            modelName.startsWith("wan-");

        String apiType = config.getApiType();
        if (apiType != null) {
            String normalizedType = apiType.trim().toLowerCase();
            if (AiApiConfig.TYPE_IMAGE.equals(normalizedType)) {
                config.setApiType(AiApiConfig.TYPE_IMAGE);
                return;
            }
            if (AiApiConfig.TYPE_TEXT.equals(normalizedType)) {
                if (isImageModel) {
                    config.setApiType(AiApiConfig.TYPE_IMAGE);
                } else {
                    config.setApiType(AiApiConfig.TYPE_TEXT);
                }
                return;
            }
        }

        config.setApiType(isImageModel ? AiApiConfig.TYPE_IMAGE : AiApiConfig.TYPE_TEXT);
    }

    private void normalizeModelName(AiApiConfig config) {
        if (config == null) {
            return;
        }
        String modelName = config.getModelName();
        if (modelName == null) {
            return;
        }
        String normalizedModelName = modelName.trim();
        if (normalizedModelName.equalsIgnoreCase("gpt-image-2")) {
            config.setModelName("gpt-image-2-all");
            return;
        }
        config.setModelName(normalizedModelName);
    }
}

