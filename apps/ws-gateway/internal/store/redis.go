package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/realbulls/ws-gateway/internal/model"
)

type Store struct {
	rdb *redis.Client
}

func New(ctx context.Context, url string) (*Store, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &Store{rdb: rdb}, nil
}

func tickChannel(symbol string) string  { return "ticks:" + symbol }
func redisChannel(symbol string) string { return "realbulls:price:" + symbol }

func (s *Store) PublishTick(ctx context.Context, t model.Tick) error {
	payload, err := json.Marshal(t)
	if err != nil {
		return err
	}
	pipe := s.rdb.Pipeline()
	pipe.Publish(ctx, tickChannel(t.Symbol), payload)
	pipe.Set(ctx, redisChannel(t.Symbol), payload, 0)
	_, err = pipe.Exec(ctx)
	return err
}

func (s *Store) PublishJSON(ctx context.Context, channel string, v interface{}) error {
	payload, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return s.rdb.Publish(ctx, channel, payload).Err()
}

func (s *Store) Registry(ctx context.Context, key string) (*model.Registry, error) {
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var reg model.Registry
	if err := json.Unmarshal(raw, &reg); err != nil {
		return nil, err
	}
	return &reg, nil
}

func (s *Store) GetStr(ctx context.Context, key string) (string, error) {
	val, err := s.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

func (s *Store) SubscribePatterns(ctx context.Context, patterns ...string) *redis.PubSub {
	return s.rdb.PSubscribe(ctx, patterns...)
}

func (s *Store) Close() error { return s.rdb.Close() }

func (s *Store) WaitReady(ctx context.Context) error {
	deadline := time.Now().Add(10 * time.Second)
	for {
		if err := s.rdb.Ping(ctx).Err(); err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return ctx.Err()
		}
		time.Sleep(250 * time.Millisecond)
	}
}
