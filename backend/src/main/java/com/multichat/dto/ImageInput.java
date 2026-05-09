package com.multichat.dto;

import lombok.Data;

@Data
public class ImageInput {

    private String mimeType;

    private String data;

    private Integer order;

    private String role;

    private String name;
}
