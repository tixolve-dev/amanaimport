// backend/src/modules/auth/auth.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const ApiError = require('../../shared/utils/ApiError');
const service = require('./auth.service');
const logger = require('../../config/logger');
const env = require('../../config/env');

function meta(req) {
    return {
        userAgent: req.headers['user-agent'] || null,
        ip: req.ip,
    };
}

async function register(req, res, next) {
    try {
        const result = await service.register(req.body, meta(req));
        return res.status(201).json(ApiResponse.created(result, 'Registration successful'));
    } catch (err) { return next(err); }
}

async function login(req, res, next) {
    try {
        const result = await service.login(req.body, meta(req));
        return res.status(200).json(ApiResponse.ok(result, 'Login successful'));
    } catch (err) { return next(err); }
}

async function refresh(req, res, next) {
    try {
        const result = await service.refresh(req.body, meta(req));
        return res.status(200).json(ApiResponse.ok(result, 'Token refreshed'));
    } catch (err) { return next(err); }
}

async function logout(req, res, next) {
    try {
        const { refreshToken, allSessions } = req.body || {};
        await service.logout({
            userId: req.user.id,
            refreshToken,
            allSessions: Boolean(allSessions),
        });
        return res.status(200).json(ApiResponse.ok(null, 'Logged out'));
    } catch (err) { return next(err); }
}

async function forgotPassword(req, res, next) {
    try {
        const result = await service.forgotPassword(req.body);
        // In dev, return the token so testers can use it. In prod, never include it.
        const body = { delivered: result.delivered };

        if ((env.isDev || env.isTest) && result.resetToken) {
            body.devResetToken = result.resetToken;
        }
        return res.status(200).json(ApiResponse.ok(body, 'If that email exists, a reset link has been sent'));
    } catch (err) { return next(err); }
}

async function resetPassword(req, res, next) {
    try {
        await service.resetPassword(req.body);
        return res.status(200).json(ApiResponse.ok(null, 'Password reset successful'));
    } catch (err) { return next(err); }
}

async function me(req, res, next) {
    try {
        const user = await service.getCurrentUser(req.user.id);
        return res.status(200).json(ApiResponse.ok(user, 'OK'));
    } catch (err) { return next(err); }
}

module.exports = {
    register, login, refresh, logout, forgotPassword, resetPassword, me,
};