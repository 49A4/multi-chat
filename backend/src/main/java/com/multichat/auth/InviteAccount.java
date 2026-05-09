package com.multichat.auth;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InviteAccount {

    private String code;
    private String userId;
    private String displayName;
    @Builder.Default
    private Boolean enabled = Boolean.TRUE;
}

