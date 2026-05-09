package com.multichat.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CanvasSnapshotDetail {

    private String id;
    private String title;
    private Long createdAt;
    private Long updatedAt;
    private JsonNode snapshot;
}
