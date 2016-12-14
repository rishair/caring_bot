import { Promise } from 'es6-promise'
import { RedisClient } from 'redis';
import { deserialize, serialize } from "class-transformer";

export class ItemStore<V> {
  get: () => Promise<V>
  put: (value: V) => Promise<V>

  constructor(get: () => Promise<V>, put: (value: V) => Promise<V>) {
    this.get = get
    this.put = put
  }

  default(value: V) {
    return new ItemStore(
      () => this.get().then(function(resp) {
        if (resp == null) {
          return Promise.resolve(value)
        } else {
          return Promise.resolve(resp)
        }
      }),
      this.put
    )
  }

  onUpdate(update: (value: V) => void) {
    let me = this
    return new ItemStore<V>(
      () => {
        let result = me.get()
        result.then(update)
        return result
      },
      (value: V) => {
        let result = me.put(value)
        result.then(update)
        return result
      }
    )
  }

  modify(transform: (input: V) => V) {
    return this.get().then((value) => {
      let originalStringifiedValue = JSON.stringify(value)
      let transformedValue = transform(value)
      let transformedStringifiedValue = JSON.stringify(transformedValue)

      console.log(originalStringifiedValue + " ?= " + transformedStringifiedValue)

      if (originalStringifiedValue != transformedStringifiedValue) {
        return this.put(transformedValue)
      } else {
        return Promise.resolve(value)
      }
    })
  }

  contramap<V2>(serializer: Serializer<V2, V>) {
    let me = this
    return new ItemStore<V2>(
      () => { return me.get().then((value) => Promise.resolve(serializer.from(value))) },
      (value: V2) => { return me.put(serializer.to(value)).then(() => value) }
    )
  }
}

export class Serializer<A, B> {
  to: (value: A) => B
  from: (value: B) => A

  constructor(to: (value: A) => B, from: (value: B) => A) {
    this.from = from
    this.to = to
  }

  static identity<T>() {
    return new Serializer<T, T>((v) => v, (v) => v);
  }
}

type Get<K, V> = (key: K) => Promise<V>
type Put<K, V> = (key: K, value: V) => Promise<V>

export abstract class Store<K, V> {
  get: Get<K, V>
  put: Put<K, V>

  constructor(get: Get<K, V>, put: Put<K, V>) {
    this.get = get
    this.put = put
  }

  abstract scope(namespace: string): Store<K, V>

  item(key: K): ItemStore<V> {
    let me = this
    return new ItemStore<V>(
      () => { return me.get(key) },
      (value: V) => { return me.put(key, value) }
    )
  }
}

export class ProxyStore<K, V> extends Store<K, V> {
  underlying: Store<K, V>

  constructor(underlying: Store<K, V>, get: Get<K, V>, put: Put<K, V>) {
    super(get, put)
    this.underlying = underlying
  }

  scope(namespace: string) {
    return this.underlying.scope(namespace)
  }

}

export class RedisStore extends Store<string, string> {
  redis: RedisClient

  constructor(redis: RedisClient) {
    super(
      (key: string) => {
        return new Promise((resolve, reject) =>
          this.redis.get(key, function(err, resp) {
            if (err) { reject(err) }
            else { resolve(resp) }
          })
        );
      },
      (key: string, value: string) => {
        return new Promise((resolve, reject) => {
          console.log("SETTING " + key + " TO " + value)
          this.redis.set(key, value, (err, resp) => {
            if (err) { reject(err) }
            else { resolve(value) }
          })
        });
      }
    )
    this.redis = redis
  }

  scope(namespace: string) {
    return new ProxyStore<string, string>(
      this,
      (key: string) => this.get(namespace + "/" + key),
      (key: string, value: string) => this.put(namespace + "/" + key, value)
    )
  }
}

