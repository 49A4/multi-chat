package com.multichat.store;

import com.multichat.model.CanvasSnapshotRecord;
import jakarta.annotation.PostConstruct;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CanvasSnapshotStore {

    private static final RowMapper<CanvasSnapshotRecord> ROW_MAPPER = CanvasSnapshotStore::mapRow;
    private final JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void ensureTable() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS canvas_snapshot (
                id VARCHAR(64) PRIMARY KEY,
                owner_id VARCHAR(128) NOT NULL,
                title VARCHAR(255) NOT NULL,
                snapshot_json CLOB NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL
            )
            """);
        jdbcTemplate.execute("""
            CREATE INDEX IF NOT EXISTS idx_canvas_snapshot_owner_updated
            ON canvas_snapshot(owner_id, updated_at)
            """);
    }

    public List<CanvasSnapshotRecord> findAllByOwner(String ownerId) {
        if (ownerId == null || ownerId.isBlank()) {
            return List.of();
        }
        return jdbcTemplate.query("""
            SELECT id, owner_id, title, snapshot_json, created_at, updated_at
            FROM canvas_snapshot
            WHERE owner_id = ?
            ORDER BY updated_at DESC
            """, ROW_MAPPER, ownerId);
    }

    public Optional<CanvasSnapshotRecord> findByIdAndOwner(String id, String ownerId) {
        if (id == null || id.isBlank() || ownerId == null || ownerId.isBlank()) {
            return Optional.empty();
        }
        List<CanvasSnapshotRecord> records = jdbcTemplate.query("""
            SELECT id, owner_id, title, snapshot_json, created_at, updated_at
            FROM canvas_snapshot
            WHERE id = ? AND owner_id = ?
            """, ROW_MAPPER, id, ownerId);
        if (records.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(records.get(0));
    }

    public boolean deleteByIdAndOwner(String id, String ownerId) {
        if (id == null || id.isBlank() || ownerId == null || ownerId.isBlank()) {
            return false;
        }
        int affected = jdbcTemplate.update("""
            DELETE FROM canvas_snapshot
            WHERE id = ? AND owner_id = ?
            """, id, ownerId);
        return affected > 0;
    }

    public CanvasSnapshotRecord save(String ownerId, String id, String title, String snapshotJson) {
        long now = System.currentTimeMillis();
        String normalizedOwnerId = ownerId == null ? "" : ownerId.trim();
        String normalizedTitle = title == null ? "未命名画布" : title.trim();
        if (normalizedTitle.isEmpty()) {
            normalizedTitle = "未命名画布";
        }
        String normalizedSnapshot = snapshotJson == null ? "{}" : snapshotJson;
        String requestedId = id == null ? "" : id.trim();

        if (!requestedId.isEmpty()) {
            int updated = jdbcTemplate.update("""
                UPDATE canvas_snapshot
                SET title = ?, snapshot_json = ?, updated_at = ?
                WHERE id = ? AND owner_id = ?
                """, normalizedTitle, normalizedSnapshot, now, requestedId, normalizedOwnerId);
            if (updated > 0) {
                return findByIdAndOwner(requestedId, normalizedOwnerId)
                    .orElseThrow(() -> new IllegalStateException("Saved canvas snapshot not found: " + requestedId));
            }
        }

        String generatedId = UUID.randomUUID().toString();
        jdbcTemplate.update("""
            INSERT INTO canvas_snapshot (id, owner_id, title, snapshot_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, generatedId, normalizedOwnerId, normalizedTitle, normalizedSnapshot, now, now);
        return CanvasSnapshotRecord.builder()
            .id(generatedId)
            .ownerId(normalizedOwnerId)
            .title(normalizedTitle)
            .snapshotJson(normalizedSnapshot)
            .createdAt(now)
            .updatedAt(now)
            .build();
    }

    private static CanvasSnapshotRecord mapRow(ResultSet rs, int rowNum) throws SQLException {
        return CanvasSnapshotRecord.builder()
            .id(rs.getString("id"))
            .ownerId(rs.getString("owner_id"))
            .title(rs.getString("title"))
            .snapshotJson(rs.getString("snapshot_json"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();
    }
}
