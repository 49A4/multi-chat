package com.multichat.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CanvasSnapshotSummary {

    private String id;
    private String title;
    private Long createdAt;
    private Long updatedAt;
}
