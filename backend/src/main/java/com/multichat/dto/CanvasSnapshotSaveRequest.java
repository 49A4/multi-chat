package com.multichat.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

@Data
public class CanvasSnapshotSaveRequest {

    private String id;
    private String title;
    private JsonNode snapshot;
}
