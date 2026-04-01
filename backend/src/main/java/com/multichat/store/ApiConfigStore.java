package com.multichat.store;

import com.fasterxml.jackson.core.type.TypeReference;
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
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class ApiConfigStore {

    private static final TypeReference<List<AiApiConfig>> CONFIG_LIST_TYPE = new TypeReference<>() { };

    private final ConcurrentHashMap<String, AiApiConfig> store = new ConcurrentHashMap<>();
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

    public AiApiConfig save(AiApiConfig config) {
        store.put(config.getId(), config);
        persistToDisk();
        return config;
    }

    public Optional<AiApiConfig> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public List<AiApiConfig> findAll() {
        return new ArrayList<>(store.values());
    }

    public List<AiApiConfig> findAllEnabled() {
        return store.values().stream()
            .filter(cfg -> Objects.equals(Boolean.TRUE, cfg.getEnabled()))
            .toList();
    }

    public boolean deleteById(String id) {
        boolean removed = store.remove(id) != null;
        if (removed) {
            persistToDisk();
        }
        return removed;
    }

    private void loadFromDisk() {
        if (!Files.exists(configFilePath)) {
            log.info("No API config file found at {}, starting with empty config list.", configFilePath);
            return;
        }

        try {
            List<AiApiConfig> loadedConfigs = objectMapper.readValue(configFilePath.toFile(), CONFIG_LIST_TYPE);
            store.clear();
            for (AiApiConfig config : loadedConfigs) {
                if (config == null || config.getId() == null || config.getId().isBlank()) {
                    continue;
                }
                store.put(config.getId(), config);
            }
            log.info("Loaded {} API configs from {}.", store.size(), configFilePath);
        } catch (IOException ex) {
            log.warn("Failed to load API configs from {}, using empty config list.", configFilePath, ex);
        }
    }

    private synchronized void persistToDisk() {
        List<AiApiConfig> snapshot = new ArrayList<>(store.values());
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
}
