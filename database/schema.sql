-- Database schema for Hedera Eco-Rewards System

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    location_latitude DECIMAL(10, 8),
    location_longitude DECIMAL(11, 8),
    location_address TEXT,
    location_city VARCHAR(100),
    location_region VARCHAR(100),
    hedera_account_id VARCHAR(50),
    did VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- EcoTokens table
CREATE TABLE IF NOT EXISTS eco_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimals INTEGER NOT NULL,
    total_supply BIGINT NOT NULL,
    treasury_account_id VARCHAR(50) NOT NULL,
    admin_key VARCHAR(255),
    freeze_key VARCHAR(255),
    wipe_key VARCHAR(255),
    supply_key VARCHAR(255),
    kyc_key VARCHAR(255),
    pause_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Cleanup activities table
CREATE TABLE IF NOT EXISTS cleanup_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_latitude DECIMAL(10, 8) NOT NULL,
    location_longitude DECIMAL(11, 8) NOT NULL,
    location_address TEXT,
    location_city VARCHAR(100),
    location_region VARCHAR(100),
    description TEXT NOT NULL,
    photos TEXT[] DEFAULT '{}',
    weight_kg DECIMAL(10, 2),
    volume_liters DECIMAL(10, 2),
    materials TEXT[] DEFAULT '{}',
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    ai_confidence DECIMAL(5, 4),
    verification_timestamp TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(255),
    verification_notes TEXT,
    rewards_earned INTEGER DEFAULT 0,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('cleanup_milestone', 'education_completion', 'community_leader', 'environmental_champion')),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    criteria TEXT NOT NULL,
    level VARCHAR(20) CHECK (level IN ('bronze', 'silver', 'gold', 'platinum')),
    points_required INTEGER NOT NULL,
    credential_id VARCHAR(255),
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Verifiable credentials table
CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID REFERENCES achievements(id) ON DELETE SET NULL,
    credential_data JSONB NOT NULL,
    credential_hash VARCHAR(255) UNIQUE NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT FALSE
);

-- HCS Topics table
CREATE TABLE IF NOT EXISTS hcs_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    admin_key VARCHAR(255),
    submit_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- HCS Messages table
CREATE TABLE IF NOT EXISTS hcs_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id VARCHAR(50) NOT NULL REFERENCES hcs_topics(topic_id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sequence_number BIGINT NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    message_hash VARCHAR(255) NOT NULL
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('user_registration', 'did_creation', 'token_mint', 'cleanup_verification', 'credential_issuance', 'system_event')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    hcs_message_id VARCHAR(255),
    transaction_id VARCHAR(255)
);

-- Token transfers table
CREATE TABLE IF NOT EXISTS token_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    memo TEXT,
    transaction_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending'))
);

-- User sessions table for JWT management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_hedera_account_id ON users(hedera_account_id);
CREATE INDEX IF NOT EXISTS idx_users_did ON users(did);
CREATE INDEX IF NOT EXISTS idx_cleanup_activities_user_id ON cleanup_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_activities_status ON cleanup_activities(verification_status);
CREATE INDEX IF NOT EXISTS idx_cleanup_activities_submitted_at ON cleanup_activities(submitted_at);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_type ON achievements(type);
CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_user_id ON verifiable_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_verifiable_credentials_hash ON verifiable_credentials(credential_hash);
CREATE INDEX IF NOT EXISTS idx_hcs_messages_topic_id ON hcs_messages(topic_id);
CREATE INDEX IF NOT EXISTS idx_hcs_messages_timestamp ON hcs_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_transfers_from_user ON token_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_token_transfers_to_user ON token_transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
