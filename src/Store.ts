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

  static simpleArray<T>() {
    return new Serializer<T[], string>(JSON.stringify, JSON.parse)
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

  modify(key: K, transform: (input: V) => V) {
    return this.get(key).then((value) => {
      let originalStringifiedValue = JSON.stringify(value)
      let transformedValue = transform(value)
      let transformedStringifiedValue = JSON.stringify(transformedValue)

      console.log(originalStringifiedValue + " ?= " + transformedStringifiedValue)

      if (originalStringifiedValue != transformedStringifiedValue) {
        return this.put(key, transformedValue)
      } else {
        return Promise.resolve(value)
      }
    })
  }

  default(getValue: (k: K) => V) {
    return new ProxyStore<K, V>(
      this,
      (key: K) => this.get(key).then(function(resp) {
        if (resp == null) {
          return Promise.resolve(getValue(key))
        } else {
          return Promise.resolve(resp)
        }
      }),
      this.put
    )
  }

  item(key: K): ItemStore<V> {
    let me = this
    return new ItemStore<V>(
      () => { return me.get(key) },
      (value: V) => { return me.put(key, value) }
    )
  }

  trackKeys(rawKeyStore: ItemStore<K[]>) {
    let keyStore = rawKeyStore.default([])
    return new ProxyStore<K, V>(
      this,
      this.get,
      (key: K, value: V) => {
        if (value == undefined || value == null) {
          return keyStore
            .modify((input) => input.filter((id) => id != key))
            .then(() => this.put(key, value))
        } else {
          return keyStore
            .modify((input) => input.filter((id) => id != key).concat(key))
            .then(() => this.put(key, value))
        }
      }
    )
  }

  contramapValue<V2>(valueSerializer: Serializer<V2, V>) {
    return new SerializingStore<K, K, V2, V>(this, (input) => input, valueSerializer)
  }

  transformKey<K2>(keyTransformer: Transformer<K2, K>) {
    return new SerializingStore<K2, K, V, V>(this, keyTransformer, Serializer.identity<V>())
  }

  contramap<K2, V2>(keyTransformer: Transformer<K2, K>, valueSerializer: Serializer<V2, V>) {
    return new SerializingStore<K2, K, V2, V>(this, keyTransformer, valueSerializer)
  }
}

type Transformer<A, B> = (input: A) => B

export class SerializingStore<K, K2, V, V2> extends Store<K, V> {
  underlying: Store<K2, V2>
  keyTransformer: Transformer<K, K2>
  valueSerializer: Serializer<V, V2>

  constructor(
    underlying: Store<K2, V2>,
    keyTransformer: Transformer<K, K2>,
    valueSerializer: Serializer<V, V2>
  ) {
    super(
      (key: K) => {
        return underlying.get(keyTransformer(key))
          .then((value) => Promise.resolve(valueSerializer.from(value)))
      },
      (key: K, value: V) => {
        return underlying.put(keyTransformer(key), valueSerializer.to(value))
          .then(() => value)
      }
    )
    this.underlying = underlying
    this.keyTransformer = keyTransformer
    this.valueSerializer = valueSerializer
  }

  scope(namespace: string): Store<K, V> {
    return new SerializingStore(
      this.underlying.scope(namespace),
      this.keyTransformer,
      this.valueSerializer
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

export class InMemoryStore<K, V> extends Store<K, V> {
  data: { [key: string]: V }
  prefix: string

  constructor(
    data: { [key: string]: V } = {},
    prefix: string = ""
  ) {
    super(
      (key) => {
        return Promise.resolve(this.data[key.toString()])
      },
      (key, value) => {
        this.data[key.toString()] = value
        return Promise.resolve(value)
      }
    )
    this.data = data
    this.prefix = prefix
  }

  scope(namespace: string) {
    return new InMemoryStore<K, V>(this.data, this.prefix + "/" + namespace)
  }
}

export class RedisStore extends Store<string, string> {
  redis: RedisClient
  prefix: string

  constructor(redis: RedisClient, prefix: string = "") {
    super(
      (key: string) => {
        return new Promise((resolve, reject) =>
          this.redis.get(this.prefix + key, function(err, resp) {
            if (err) { reject(err) }
            else { resolve(resp) }
          })
        );
      },
      (key: string, value: string) => {
        return new Promise((resolve, reject) => {
          this.redis.set(this.prefix + key, value, (err, resp) => {
            if (err) { reject(err) }
            else { resolve(value) }
          })
        });
      }
    )
    this.redis = redis
    if (prefix == "" || prefix.charAt(prefix.length - 1) == "/") {
      this.prefix = prefix
    } else {
      this.prefix = prefix + "/"
    }
  }

  scope(namespace: string) {
    return new RedisStore(this.redis, this.prefix + namespace)
  }
}



