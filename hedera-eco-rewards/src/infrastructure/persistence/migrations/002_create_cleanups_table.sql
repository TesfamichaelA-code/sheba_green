-- Create cleanups table
CREATE TABLE IF NOT EXISTS cleanups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location JSONB NOT NULL,
    before_image_url VARCHAR(500) NOT NULL,
    after_image_url VARCHAR(500) NOT NULL,
    waste_type VARCHAR(50) NOT NULL,
    estimated_amount DECIMAL(10,2) NOT NULL,
    area_size DECIMAL(10,2),
    verification_status VARCHAR(20) DEFAULT 'pending',
    ai_verification_data JSONB,
    ai_confidence_score DECIMAL(5,4),
    reward_amount BIGINT DEFAULT 0,
    impact_score DECIMAL(10,2) DEFAULT 0.00,
    hedera_transaction_id VARCHAR(100),
    consensus_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cleanups_user_id ON cleanups(user_id);
CREATE INDEX IF NOT EXISTS idx_cleanups_verification_status ON cleanups(verification_status);
CREATE INDEX IF NOT EXISTS idx_cleanups_created_at ON cleanups(created_at);
CREATE INDEX IF NOT EXISTS idx_cleanups_verified_at ON cleanups(verified_at);
CREATE INDEX IF NOT EXISTS idx_cleanups_waste_type ON cleanups(waste_type);
CREATE INDEX IF NOT EXISTS idx_cleanups_location_gist ON cleanups USING GIST ((location->>'coordinates'));

-- Create trigger for updated_at
CREATE TRIGGER update_cleanups_updated_at 
    BEFORE UPDATE ON cleanups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();