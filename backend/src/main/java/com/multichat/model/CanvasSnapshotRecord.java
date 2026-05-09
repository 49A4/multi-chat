package com.multichat.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CanvasSnapshotRecord {

    private String id;
    private String ownerId;
    private String title;
    private String snapshotJson;
    private Long createdAt;
    private Long updatedAt;
}
